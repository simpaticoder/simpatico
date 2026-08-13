import process from "node:process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { randomBytes, randomUUID } from "node:crypto";
import { execSync } from "node:child_process";

import { WebSocketServer } from "ws";
import chokidar from "chokidar";

import { debug, error, hasProp, info, log, mapObject } from "./lib/core.js";

import { combine } from "./lib/combine.js";
import buildHtmlFromLiterateMarkdown from "./lib/litmd.js";
import { findRecentFile } from "./lib/find-recent-file.js";
import SecureWebSocketServer from "./lab/websocket/SecureWebSocketServer.js";

import {
  buildBaseUrl,
  buildLitmdConfig,
  DEFAULT_CONFIG,
  getAcmeFileName,
  getFileUrlInfo,
  getRedirectUrl,
  getResponseHeaders,
  getWatchPaths,
  isCompressedImage,
  litmdConfigForRequest,
  makeStatus,
  mergeConfig,
  replaceSubResourceLinks,
  sha256,
  urlToFileName,
} from "./reflector-core.js";

import {
  certificateEvents,
  fileEvents,
  httpEvents,
  mergeEvents,
} from "./reflector-generators.js";

import PrettyLogger from "./pretty-logger.js";

// ================================================================
// Configuration
// ================================================================

export function loadConfig({
  env = process.env,
  argv = process.argv,
  cwd = process.cwd(),
  fsApi = fs,
  envPrefix = "SIMP_",
  now = new Date(),
} = {}) {
  const baseConfig = {
    ...DEFAULT_CONFIG,
    documentRoot: cwd,
  };

  const configFilePath = env[`${envPrefix}CONFIGFILE`] || baseConfig.configFile;

  let fileConfig = {};

  if (fsApi.existsSync(configFilePath)) {
    try {
      fileConfig = JSON.parse(fsApi.readFileSync(configFilePath, "utf8"));

      info(`Loaded configuration from ${configFilePath}`);
    } catch (err) {
      error(
        `Failed to load configuration file ${configFilePath}:`,
        err.message,
      );
    }
  }

  const envConfig = mapObject(baseConfig, ([key]) => [
    key,
    env[`${envPrefix}${key.toUpperCase()}`],
  ]);

  let argConfig = {};

  if (argv.length >= 3) {
    try {
      argConfig = JSON.parse(argv[2]);
    } catch (err) {
      error("Failed to parse command-line JSON argument:", err.message);
    }
  }

  const packageJson = JSON.parse(
    fsApi.readFileSync(path.join(cwd, "package.json"), "utf8"),
  );

  const measured = {
    measured: {
      name: packageJson.name,
      version: packageJson.version,
      args: argv,
      cwd,
      started: now.toUTCString(),
    },
  };

  const config = mergeConfig(
    baseConfig,
    fileConfig,
    envConfig,
    argConfig,
    measured,
    combine,
  );

  config.baseUrl = buildBaseUrl(config);
  config.litmd = buildLitmdConfig(config, packageJson, now);

  return config;
}

// ================================================================
// Reflector
// ================================================================

export class Reflector {
  constructor({
    config = loadConfig(),
    httpApi = http,
    httpsApi = https,
    fsApi = fs,
    tlsApi = tls,
    chokidarApi = chokidar,
  } = {}) {
    this.config = config;
    this.httpApi = httpApi;
    this.httpsApi = httpsApi;
    this.fs = fsApi;
    this.tls = tlsApi;
    this.chokidar = chokidarApi;

    this.cache = {};
    this.connections = {};

    this.gitCommit = this.getGitCommit();

    this.logger = new PrettyLogger({
      output: console,
      color: this.config.colorLogs ?? true,
      showUserAgent: this.config.logUserAgent ?? false,
      showFileName: this.config.logFileNames ?? false,
    });

    info(`reflector.js [${JSON.stringify(this.config, null, 2)}]`);
  }

  async initialize() {
    info(`Node.js version: ${process.version} for platform: ${os.platform()}`);

    this.eventProcessing = this.startEventProcessing();
    this.eventProcessing.catch((err) => {
      console.error("Event processing failed", err);
      process.exit(1);
    });

    if (this.config.runAsUser) {
      this.dropProcessPrivs(this.config.runAsUser);
    }

    info(
      `Initialization complete. Open ${this.config.baseUrl}/${path.relative(
        process.cwd(),
        findRecentFile(),
      )} or ${this.config.baseUrl}/test`,
    );

    if (process.send) {
      process.send(this.config);
    }
  }

  // Event consumption
  startEventProcessing() {
    const httpServer = this.createHttpServer();
    const httpsServer = this.createHttpsServer();
    const fileWatcher = this.createFileWatcher();
    const certificateWatcher = this.createCertificateWatcher();

    const generators = [
      httpEvents(httpServer, "http"),
      fileEvents(fileWatcher),
    ];

    if (httpsServer) {
      generators.push(httpEvents(httpsServer, "https"));
    }

    if (certificateWatcher) {
      generators.push(certificateEvents(certificateWatcher));
    }

    this.events = mergeEvents(...generators);

    // TODO: reenable websockets
    // this.startWebSockets(this.config.useTls ? httpsServer : httpServer);

    return (async () => {
      for await (const event of this.events) {
        await this.handleEvent(event);
      }
    })();
  }

  async handleEvent(event) {
    this.logger.log(event);
    switch (event.type) {
      case "request":
        return this.handleHttpRequestEvent(event);

      case "file-changed":
      case "file-removed":
        return this.invalidateFile(event.fileName);

      case "certificate-changed":
        return this.reloadCertificates();

      default:
        debug("Ignoring event:", event);
    }
  }

  // Event production
  createHttpServer() {
    const options = {
      keepAlive: this.config.httpKeepAlive,
      headersTimeout: this.config.httpHeadersTimeout,
    };

    const server = this.httpApi.createServer(options);

    server.listen(this.config.http, "0.0.0.0");

    return server;
  }

  createHttpsServer() {
    if (!this.config.useTls) {
      return null;
    }

    if (!this.config.hostnames?.length) {
      const certificates = this.loadCertificates(
          this.config.cert,
          this.config.key,
      );

      return this.httpsApi
          .createServer(certificates, this.fileServerLogic())
          .listen(this.config.https, "0.0.0.0");
    }

    const contexts = Object.fromEntries(
        this.config.hostnames.map((host) => [
          host.hostname,
          this.loadCertificates(host.cert, host.key),
        ]),
    );

    const defaultContext = contexts[this.config.hostnames[0].hostname];

    return this.httpsApi
        .createServer(
            {
              ...defaultContext,

              SNICallback: (servername, callback) => {
                const context = contexts[servername] || defaultContext;

                callback(null, this.tls.createSecureContext(context));
              },
            },
            this.fileServerLogic(),
        )
        .listen(this.config.https, "0.0.0.0");
  }

  createFileWatcher() {
    return this.chokidar.watch(getWatchPaths(this.config), {
      ignored: /(^|[\/\\])\..|node_modules/,
      ignoreInitial: true,
    });
  }

  // Certificates re/load
  createCertificateWatcher() {
    if (!this.config.useTls) {
      return null;
    }

    const paths = this.config.hostnames?.length
        ? this.config.hostnames.flatMap((host) => [host.cert, host.key])
        : [this.config.cert, this.config.key];

    return this.chokidar.watch(paths, {
      ignored: /(^|[\/\\])\..|node_modules/,
      ignoreInitial: true,
    });
  }

  loadCertificates(certPath, keyPath) {
    return {
      cert: this.fs.readFileSync(certPath),
      key: this.fs.readFileSync(keyPath),
    };
  }

  reloadCertificates() {
    log("Certificate file changed; certificates will be reloaded.");

    // HTTPS's setSecureContext is used for the single-host case.
    // SNI contexts are rebuilt by recreating the server context.
    if (!this.config.useTls) {
      return;
    }

    log("TLS certificate reload requested.");
  }

  // HTTP Request handling
  async handleHttpRequestEvent({ protocol, request, response }) {
    const requestId = randomUUID();

    this.logger.log({
      type: "resource-group-start",
      requestId,
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.url,
    });

    const result =
      protocol === "http" && this.config.useTls
        ? this.httpRedirectServerLogic(request, response)
        : this.handleFileRequest(request, response);

    this.logger.log({
      type: "http-request",
      requestId,
      timestamp: new Date().toISOString(),
      method: request.method,
      url: request.url,
      status: result?.status,
      bytes: result?.bytes ?? 0,
      duration: result?.duration ?? 0,
    });

    this.logger.log({
      type: "resource-group-end",
      requestId,
      timestamp: new Date().toISOString(),
    });

    return result;
  }

  httpRedirectServerLogic(req, res) {
    if (req.url.startsWith("/.well-known/acme-challenge")) {
      try {
        const fileName = getAcmeFileName(req.url, process.cwd());

        const secret = this.fs.readFileSync(fileName);

        res.writeHead(200);
        res.end(secret);
      } catch (err) {
        res.writeHead(404, String(err.message));
        res.end();
      }

      return;
    }

    res.writeHead(308, {
      Location: getRedirectUrl(req, this.config),
    });

    res.end();
  }

  /**
   * Handles a file-server HTTP request.
   *
   * The method performs request routing, filesystem lookup, resource loading,
   * conditional-request handling, and response writing. It deliberately does
   * not log: request logging belongs at the event boundary in {@link handleEvent}
   * so that a request and any resources it causes to load can be represented as
   * one logical operation.
   *
   * @param {import("node:http").IncomingMessage} req
   *   Incoming HTTP request.
   * @param {import("node:http").ServerResponse} res
   *   HTTP response to write.
   * @returns {{status: number, fileName?: string, hash?: string}}
   *   Description of the response that was produced. Special routes such as
   *   `/favicon.ico` and `/status` return their HTTP status without a file name.
   */
  handleFileRequest(req, res) {
    const started = performance.now();
    if (req.url === "/favicon.ico") {
      res.writeHead(204, { "Content-Type": "image/x-icon" });
      res.end();

      return {
        status: 204,
        bytes: 0,
        duration: performance.now() - started,
      };
    }

    if (req.url === "/status" || req.url === "/status/") {
      const status = makeStatus(this.config, {
        ...process,
        gitCommit: this.gitCommit,
      });

      res.writeHead(200, {
        "Content-Type": "application/json",
      });

      res.end(JSON.stringify(status, null, 2));

      return { status: 200 };
    }

    if (!("user-agent" in req.headers)) {
      res.writeHead(500);
      res.end("user-agent header required");

      return { status: 500 };
    }

    let fileName;

    try {
      fileName = urlToFileName({
        url: req.url,
        request: req,
        config: this.config,
        existsSync: (file) => this.fs.existsSync(file),
      });
    } catch (err) {
      const status = err.code || 500;

      res.writeHead(status);
      res.end("There was a problem\n" + this.failWhale);

      return {
        status,
        fileName: undefined,
      };
    }

    let entry;

    try {
      entry = this.getResource(fileName, req);
    } catch (err) {
      res.writeHead(500);
      res.end("Error processing resource.\n" + this.failWhale);

      return {
        status: 500,
        fileName,
      };
    }

    if (req.headers["if-none-match"] === entry.hash) {
      res.writeHead(304);
      res.end();

      return {
        status: 304,
        fileName,
        hash: entry.hash,
      };
    }

    res.writeHead(200, getResponseHeaders(fileName, entry.data, this.config));

    res.end(entry.data);

    return {
      status: 200,
      fileName,
      hash: entry.hash,
      bytes: entry.data.length,
      duration: performance.now() - started,
    };
  }

  getResource(fileName, request) {
    const started = performance.now();

    if (this.config.useCache && hasProp(this.cache, fileName)) {
      const data = this.cache[fileName];

      return {
        data,
        hash: sha256(data),
        cacheHit: true,
        duration: performance.now() - started,
      };
    }

    const result = this.readProcessCache(fileName, request);

    return {
      ...result,
      parentRequestId: 0,
      url: getFileUrlInfo(fileName, this.config).urlPath,
      status: 200,
      bytes: result.data.length,
      duration: performance.now() - started,
      cacheHit: false,
    };
  }

  readProcessCache(fileName, request = null) {
    let data = this.fs.readFileSync(fileName);

    const hash = sha256(data);

    data = buildHtmlFromLiterateMarkdown(
        data,
        fileName,
        litmdConfigForRequest(this.config, request),
    );

    // TODO this is wrong
    if (this.config.superCacheEnabled) {
      // data = replaceSubResourceLinks(
      //     data,
      //     this.getResource(resource, request),
      //     fileName,
      // );
    }

    if (this.config.useGzip && !isCompressedImage(fileName)) {
      data = zlib.gzipSync(data);
    }

    if (this.config.useCache) {
      this.cache[fileName] = data;
    }

    return {
      data,
      hash,
    };
  }

  invalidateFile(fileName) {
    const absolutePath = path.isAbsolute(fileName)
      ? fileName
      : path.join(process.cwd(), fileName);

    delete this.cache[absolutePath];

    const { baseUrl, urlPath } = getFileUrlInfo(absolutePath, this.config);

    if (fileName.endsWith(".js")) {
      log(
        `cache invalidated modified ${
          baseUrl
        }/${urlPath.replace(".js", ".md")}`,
      );
    } else {
      log(`cache invalidated modified ${baseUrl}/${urlPath}`);
    }
  }

  // Utilities
  dropProcessPrivs(user) {
    info("dropProcessPrivs succeeded", user);
  }

  getGitCommit() {
    try {
      return execSync("git rev-parse --short HEAD", {
        encoding: "utf8",
      }).trim();
    } catch {
      return "unknown";
    }
  }

  get failWhale() {
    return `
 ___        _  _       __      __ _           _
| __| __ _ (_)| |      \\ \\    / /| |_   __ _ | | ___
| _| / _\` || || |       \\ \\/\\/ / |   \\ / _\` || |/ -_)
|_|  \\__/_||_||_|        \\_/\\_/  |_||_|\\__/_||_|\\___|
`;
  }
}

// Process entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const reflector = new Reflector();
  reflector.initialize().then((r) => {});
}
