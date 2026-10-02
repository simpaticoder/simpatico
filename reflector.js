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
  websocketEvents,
} from "./reflector-generators.js";

import PrettyLogger from "./pretty-logger.js";


// Configuration
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

export class Reflector {
  constructor({
    config = loadConfig(),
    httpApi = http,
    httpsApi = https,
    wsApi = WebSocketServer,
    fsApi = fs,
    tlsApi = tls,
    chokidarApi = chokidar,
  } = {}) {
    this.config = config;
    this.httpApi = httpApi;
    this.httpsApi = httpsApi;
    this.wsApi = wsApi;
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

    const httpServer = this.httpServer ?? this.httpsServer;
    if (httpServer?._listenPromise) {
      try {
        await httpServer._listenPromise;
        info(`Listening on port ${this.config.http}`);
      } catch (err) {
        error("HTTP server failed to start:", err.message);
        process.exit(1);
      }
    }
    if (this.httpsServer?._listenPromise) {
      try {
        await this.httpsServer._listenPromise;
        info(`Listening on port ${this.config.https}`);
      } catch (err) {
        error("HTTPS server failed to start:", err.message);
        process.exit(1);
      }
    }

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
    this.httpServer = httpServer;
    this.httpsServer = this.createHttpsServer(); // add it as a member to support cert reloading
    const fileWatcher = this.createFileWatcher();
    const certificateWatcher = this.createCertificateWatcher();

    const generators = [
      httpEvents(httpServer, "http"),
      fileEvents(fileWatcher),
    ];

    if (this.config.useTls && this.httpsServer) {
      generators.push(httpEvents(this.httpsServer, "https"));
    }

    if (this.config.enableWebsockets && (this.httpsServer || httpServer)) {
      this.wsServer = this.createWebSocketServer(this.httpsServer || httpServer);
      generators.push(websocketEvents(this.wsServer, this.webSocketKeys))
    }

    if (certificateWatcher) {
      generators.push(certificateEvents(certificateWatcher));
    }

    this.events = mergeEvents(...generators);


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
        return this.reloadCertificates(event.fileName);

      case "websocket-registered":
        return this.handleWebSocketRegistered(event);

      case "websocket-message":
        return this.handleWebSocketMessage(event);

      case "websocket-registration-failed":
        return this.handleWebSocketRegistrationFailed(event);

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

    server._listenPromise = new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    server.listen(this.config.http, "0.0.0.0");

    return server;
  }

  createHttpsServer() {
    if (!this.config.useTls) {
      return null;
    }

    const server = !this.config.hostnames?.length
      ? this.httpsApi.createServer(
          this.loadCertificates(this.config.cert, this.config.key),
          this.fileServerLogic())
      : (() => {
          this.certificateContexts = Object.fromEntries(
            this.config.hostnames.map((host) => [
              host.hostname,
              this.loadCertificates(host.cert, host.key),
            ]),
          );
          const defaultContext =
            this.certificateContexts[this.config.hostnames[0].hostname];
          return this.httpsApi.createServer({
            ...defaultContext,
            SNICallback: (servername, callback) => {
              const context =
                this.certificateContexts[servername] ||
                this.certificateContexts[this.config.hostnames[0].hostname];
              callback(null, this.tls.createSecureContext(context));
            },
          });
        })();

    server._listenPromise = new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    server.listen(this.config.https, "0.0.0.0");
    return server;
  }

  createFileWatcher() {
    return this.chokidar.watch(getWatchPaths(this.config), {
      ignored: /(^|[\/\\])\..|node_modules/,
      ignoreInitial: true,
    });
  }

  createWebSocketServer(server) {
    this.webSocketKeys = SecureWebSocketServer.generateKeys();

    return new this.wsApi({
      server,
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

    log("Watching certificate paths for changes:", paths.join(", "));

    return this.chokidar.watch(paths, {
      ignored: /(^|[\/\\])\..|node_modules/,
      ignoreInitial: true,
      followSymlinks: true,
      awaitWriteFinish: { stabilityThreshold: 2000 },
    });
  }

  loadCertificates(certPath, keyPath) {
    return {
      cert: this.fs.readFileSync(certPath),
      key: this.fs.readFileSync(keyPath),
    };
  }

  reloadCertificates(fileName) {
    if (!this.config.useTls || !this.httpsServer) {
      return;
    }

    log(`Certificate file changed: ${fileName}`);

    try {
      if (!this.config.hostnames?.length) {
        const ctx = this.loadCertificates(this.config.cert, this.config.key);
        this.httpsServer.setSecureContext(ctx);
        log("Reloaded default certificate successfully");
        return;
      }

      const host = this.config.hostnames.find(
          (host) => host.cert === fileName || host.key === fileName,
      );

      if (!host) {
        log(`Could not match changed file to any hostname: ${fileName}`);
        return;
      }

      this.certificateContexts[host.hostname] = this.loadCertificates(host.cert, host.key);
      log(`Reloaded certificate for ${host.hostname}`);

      // Update the default certificate if the default hostname changed.
      if (host === this.config.hostnames[0]) {
        this.httpsServer.setSecureContext(
            this.certificateContexts[host.hostname],
        );
        log("Updated default secure context");
      }
    } catch (err) {
      error(`Failed to reload certificate from ${fileName}:`, err.message);
    }
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

    if (req.url.startsWith("/.well-known/appspecific/")) {
      res.writeHead(404);
      res.end();

      return { status: 404, bytes: 0, duration: performance.now() - started };
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

  //Web sockets
  handleWebSocketRegistered({ connection }) {
    if (hasProp(this.connections, connection.publicKey)) {
      connection.socket.send(
        JSON.stringify({ error: "SOCKET_ALREADY_REGISTERED" })
      );
      connection.close();
      return;
    }

    this.connections[connection.publicKey] = connection;

    connection.onclose = () => {
      delete this.connections[connection.publicKey];
      debug("WebSocket unregistered:", connection.publicKey);
    };

    debug("WebSocket registered:", connection.publicKey);
  }

  handleWebSocketRegistrationFailed({ error }) {
    debug("WebSocket registration failed:", error?.message || error);
  }

  handleWebSocketMessage({ connection, message }) {
    const { type, from, to } = message;
    const fromSocket = this.connections[from];
    const toSocket = this.connections[to];

    // Validate sender identity
    if (!fromSocket) {
      connection.socket.send(
        JSON.stringify({ ...message, error: "SOCKET_NOT_REGISTERED" })
      );
      return;
    }

    if (fromSocket !== connection) {
      connection.socket.send(
        JSON.stringify({ ...message, error: "MISMATCHED_SOCKET_PUBLIC_KEY" })
      );
      return;
    }

    // Validate message structure
    if (message.message === undefined) {
      connection.socket.send(
        JSON.stringify({ ...message, error: "MISSING_CONTENT_FIELD" })
      );
      return;
    }

    if (type !== "MESSAGE") {
      connection.socket.send(
        JSON.stringify({ ...message, error: "MISSING_TYPE_MESSAGE" })
      );
      return;
    }

    // Route to recipient
    if (!toSocket) {
      connection.socket.send(
        JSON.stringify({ error: "RECIPIENT_NOT_AVAILABLE", to })
      );
      return;
    }

    toSocket.send(JSON.stringify(message));
  }



  // Utilities
  dropProcessPrivs(user) {
    if (!user || process.getuid() !== 0) {
      // Only root can drop privileges. If not running as root, skip.
      info(`dropProcessPrivs: skipping (user=${user}, uid=${process.getuid()})`);
      return;
    }

    try {
      // Drop supplementary groups, then group, then user privileges.
      // This order is critical: once setuid() is called, we lose CAP_SETUID
      // and can no longer call setgid() or setgroups().
      process.setgroups([]);

      // Try setgid with the user string first. If that fails (e.g.
      // 'nobody' user exists but no 'nobody' group), try the numeric
      // GID from the password database.
      try {
        process.setgid(user);
      } catch {
        // On failure, look up the user's GID from the passwd database
        const { execSync } = require("node:child_process");
        const entry = execSync(`getent passwd ${user}`, { encoding: "utf8" }).trim();
        const gid = parseInt(entry.split(":")[3], 10);
        process.setgid(gid);
      }

      process.setuid(user);
      info(`dropProcessPrivs succeeded to user ${user} (uid=${process.getuid()}, gid=${process.getgid()})`);
    } catch (err) {
      error(`dropProcessPrivs failed for user ${user}:`, err.message);
    }
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
