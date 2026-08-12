import path from "node:path";
import { createHash } from "node:crypto";

export const MIME_TYPES = {
  html: "text/html",
  js: "application/javascript",
  mjs: "application/javascript",
  json: "application/json",
  css: "text/css",
  svg: "image/svg+xml",
  wasm: "application/wasm",
  pdf: "application/pdf",
  md: "text/html",
  png: "image/x-png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  woff2: "font/woff2",
  xml: "application/xml",
};

export const DEFAULT_CONFIG = {
  http: 8080,
  https: 8443,
  hostname: "localhost",
  cert: "./fullchain.pem",
  key: "./privkey.pem",
  runAsUser: "",
  useCache: true,
  useGzip: true,
  useTls: false,
  enableWebsockets: true,
  logFileServerRequests: true,
  superCacheEnabled: false,
  debug: false,
  configFile: "./server.config.json",
  documentRoot: process.cwd(),
  hostnames: null,
  httpKeepAlive: 100,
  httpHeadersTimeout: 100,
};

export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

export function isCompressedImage(fileName) {
  return [".png", ".jpg", ".jpeg", ".gif"].some((extension) =>
    fileName.endsWith(extension),
  );
}

export function getCandidateFiles(urlPath) {
  const parts = urlPath.split("/");
  const last = parts.at(-1);
  const isFile = /\./.test(last);

  if (parts.some((part) => part.startsWith("."))) {
    const error = new Error(
      `Invalid path (contains dot-prefixed segment): ${urlPath}`,
    );
    error.code = 500;
    throw error;
  }

  if (urlPath.startsWith("/angular")) {
    const dist = "/lab/angular/dist/angular/browser";
    const subpath = urlPath.slice("/angular".length);

    if (isFile) {
      const normalized = subpath.startsWith("/") ? subpath : `/${subpath}`;

      return [`${dist}${normalized}`];
    }

    return [`${dist}/index.html`];
  }

  if (urlPath.endsWith("/")) {
    return [
      `${urlPath}index.md`,
      `${urlPath}index.html`,
      `${urlPath}README.md`,
    ];
  }

  if (isFile) {
    return [urlPath];
  }

  return [
    `${urlPath}.md`,
    `${urlPath}.html`,
    `${urlPath}/index.md`,
    `${urlPath}/index.html`,
    `${urlPath}/README.md`,
  ];
}

export function hostnameFromRequest(request, fallbackHostname) {
  const host = request?.headers?.host || fallbackHostname;
  return host.split(":")[0];
}

export function documentRootForRequest(config, request) {
  if (!request || !config.hostnames?.length) {
    return config.documentRoot;
  }

  const hostname = hostnameFromRequest(request, config.hostname);
  const hostConfig = config.hostnames.find(
    (item) => item.hostname === hostname,
  );

  return hostConfig?.documentRoot || config.documentRoot;
}

export function litmdConfigForRequest(config, request) {
  const hostname = request
    ? hostnameFromRequest(request, config.hostname)
    : config.hostname;

  return {
    ...config.litmd,
    hostname,
    documentRoot: documentRootForRequest(config, request),
  };
}

export function urlToFileName({ url, request, config, existsSync }) {
  const urlPath = url.split("?")[0];
  const documentRoot = documentRootForRequest(config, request);
  const candidates = getCandidateFiles(urlPath);

  for (const candidate of candidates) {
    const fileName = documentRoot + candidate;

    if (existsSync(fileName)) {
      return fileName;
    }
  }

  const error = new Error(`No candidate found for path: ${urlPath}`);
  error.code = 404;
  error.candidates = candidates;
  throw error;
}

export function getContentTypeHeaders(fileName, { useGzip = true } = {}) {
  const extension = path.extname(fileName).slice(1);
  const type = MIME_TYPES[extension] || "text";

  return {
    "Content-Type": type,
    "Content-Encoding": useGzip && !isCompressedImage(fileName) ? "gzip" : "",
  };
}

export function getCacheHeaders(
  fileName,
  data,
  { superCacheEnabled = false } = {},
) {
  const isPrimaryResource =
    fileName.endsWith(".html") || fileName.endsWith(".md");

  return {
    ETag: sha256(data),
    "Cache-Control":
      superCacheEnabled && !isPrimaryResource
        ? "public, max-age=31536000, immutable"
        : "no-cache",
  };
}

export function getCrossOriginHeaders() {
  return {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  };
}

export function getContentSecurityPolicyHeaders() {
  return {
    "Content-Security-Policy": [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data:",
    ].join(";"),
  };
}

export function getResponseHeaders(fileName, data, config) {
  return {
    ...getContentTypeHeaders(fileName, config),
    ...getCacheHeaders(fileName, data, config),
    ...getCrossOriginHeaders(),
    ...getContentSecurityPolicyHeaders(),
  };
}

export function getRedirectUrl(request, config) {
  const hostname = hostnameFromRequest(request, config.hostname);

  return `https://${hostname}${
    config.https === 443 ? "" : `:${config.https}`
  }${request.url}`;
}

export function getAcmeToken(url) {
  const prefix = "/.well-known/acme-challenge/";

  let pathname;

  try {
    pathname = new URL(url, "http://localhost").pathname;
  } catch {
    throw new Error("Invalid request URL");
  }

  if (!pathname.startsWith(prefix)) {
    throw new Error("Not an ACME challenge URL");
  }

  const remainder = pathname.slice(prefix.length);

  // ACME HTTP-01 challenge tokens are a single path segment.
  if (!remainder || remainder.includes("/")) {
    throw new Error("Invalid ACME challenge token");
  }

  if (!/^[A-Za-z0-9_-]+$/.test(remainder)) {
    throw new Error("Invalid ACME challenge token");
  }

  return remainder;
}

export function getAcmeFileName(url, cwd) {
  getAcmeToken(url);
  return cwd + url;
}

export function getWatchPaths(config, fallback = ".") {
  if (!config.hostnames?.length) {
    return [config.documentRoot || fallback];
  }

  const paths = config.hostnames
    .map((host) => host.documentRoot)
    .filter(Boolean);

  return paths.length ? paths : [fallback];
}

export function getFileUrlInfo(fileName, config, cwd = process.cwd()) {
  if (config.hostnames?.length) {
    for (const host of config.hostnames) {
      if (!host.documentRoot) continue;

      const documentRoot = path.isAbsolute(host.documentRoot)
        ? host.documentRoot
        : path.join(cwd, host.documentRoot);

      if (!fileName.startsWith(documentRoot)) continue;

      const protocol = config.useTls ? "https" : "http";
      const port = config.useTls ? config.https : config.http;

      return {
        baseUrl: `${protocol}://${host.hostname}:${port}`,
        urlPath: path.relative(documentRoot, fileName),
      };
    }
  }

  const documentRoot = config.documentRoot || cwd;
  const absoluteDocumentRoot = path.isAbsolute(documentRoot)
    ? documentRoot
    : path.join(cwd, documentRoot);

  return {
    baseUrl: config.baseUrl,
    urlPath: path.relative(absoluteDocumentRoot, fileName),
  };
}

export function makeStatus(config, runtime) {
  const memory = runtime.memoryUsage();

  return {
    git: runtime.gitCommit,
    node: runtime.version,
    platform: runtime.platform,
    arch: runtime.arch,
    uptime: Math.floor(runtime.uptime()),
    started: config.measured.started,
    memory: {
      rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`,
    },
    hostname: config.hostname,
    version: config.measured.version,
  };
}

export function buildBaseUrl(config) {
  const hostname = config.hostnames?.length
    ? config.hostnames[0].hostname
    : config.hostname;

  return config.useTls
    ? `https://${hostname}${config.https === 443 ? "" : `:${config.https}`}`
    : `http://${hostname}${config.http === 80 ? "" : `:${config.http}`}`;
}

export function buildLitmdConfig(config, packageJson, now = new Date()) {
  const primaryHostname = config.hostnames?.length
    ? config.hostnames[0].hostname
    : config.hostname;

  return {
    hostname: primaryHostname,
    specialPathPrefix: "/",
    baseUrl: config.baseUrl,
    author: packageJson.name,
    keywords: "es6, minimalist, vanillajs, notebook",
    copyrightHolder: packageJson.name,
    copyrightYear: now.getFullYear(),
  };
}

export function mergeConfig(
  baseConfig,
  fileConfig,
  envConfig,
  argConfig,
  measured,
  combine,
) {
  return combine(
    [baseConfig, fileConfig, envConfig, argConfig, measured],
    (a, b) => {
      if (typeof a === "number" && typeof b === "number") {
        return b;
      }

      if (typeof a === "number" && typeof b === "string") {
        return +b;
      }

      if (typeof a === "boolean" && typeof b === "string") {
        return b === "true";
      }
    },
  );
}

export function makeCacheEntry(data, hash = sha256(data)) {
  return { data, hash };
}

export function replaceSubResourceLinks(html, readResource, fileName) {
  const isHTML = fileName.endsWith(".html");
  const isMD = fileName.endsWith(".md");

  if (!isHTML && !isMD) {
    return html;
  }

  let result = html.toString();

  const regex = /(["`'])(.*?)\?\#\#\#\1(.*?)/g;
  let match;

  while ((match = regex.exec(result)) !== null) {
    const resource = match[2];
    const resourceData = readResource(resource);
    const resourceHash = resourceData.hash;

    const oldUrl = match[0];
    const newUrl = `"${resource}?${resourceHash}"`;

    result = result.replace(oldUrl, newUrl);
  }

  return result;
}

export function createRequestLogEvent({
  requestId,
  protocol,
  request,
  status,
  fileName,
  bytes,
  duration,
  cacheHit = false,
  compressed = false,
  parentRequestId = null,
}) {
  return {
    type: "http-request",
    requestId,
    parentRequestId,
    protocol,
    method: request.method,
    url: request.url,
    host: request.headers.host || "",
    clientAddress: request.socket?.remoteAddress || "",
    userAgent: request.headers["user-agent"] || "",
    status,
    fileName,
    bytes,
    duration,
    cacheHit,
    compressed,
    timestamp: new Date().toISOString(),
  };
}

export function createResourceGroupEvent({
  requestId,
  url,
  fileName,
  dependencies = [],
}) {
  return {
    type: "resource-group",
    requestId,
    url,
    fileName,
    dependencies,
    timestamp: new Date().toISOString(),
  };
}

export function getUserAgentName(userAgent = "") {
  if (!userAgent) return "-";

  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Safari\//.test(userAgent)) return "Safari";
  if (/curl\//.test(userAgent)) return "curl";

  return userAgent.slice(0, 30);
}

export function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return "-";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDuration(ms) {
  if (ms === undefined || ms === null) return "-";
  if (ms < 1) return "<1ms";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function getStatusColor(status) {
  if (status >= 500) return "red";
  if (status >= 400) return "yellow";
  if (status >= 300) return "cyan";
  return "green";
}

export function isPrimaryResource(url = "") {
  return (
    url.endsWith(".html") ||
    url.endsWith(".md") ||
    url === "/" ||
    !/\.[^/]+$/.test(url)
  );
}
