// test/reflector.test.js
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";

import { Reflector } from "../reflector.js";
import {
  certificateEvents,
  fileEvents,
  httpEvents,
  mergeEvents,
} from "../reflector-generators.js";

import {
  litmdConfigForRequest,
} from "../reflector-core.js";

// ================================================================
// Helpers
// ================================================================

function makeResponse() {
  return {
    status: undefined,
    headers: undefined,
    body: undefined,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.body = body;
    },
  };
}

function makeRequest(url, overrides = {}) {
  return {
    url,
    headers: {
      "user-agent": "node-test",
      ...overrides.headers,
    },
    socket: {
      remoteAddress: "127.0.0.1",
    },
    ...overrides,
  };
}

/**
 * Create a minimal Reflector instance for testing.
 * Override any DI dependencies with the provided mocks.
 */
function makeReflector(overrides = {}) {
  const config = {
    hostname: "localhost",
    documentRoot: "/site",
    hostnames: null,
    http: 8080,
    https: 8443,
    useTls: false,
    useGzip: false,
    useCache: false,
    superCacheEnabled: false,
    enableWebsockets: false,
    logFileServerRequests: false,
    measured: {
      name: "test",
      version: "1.0.0",
      started: "today",
    },
    baseUrl: "http://localhost:8080",
    litmd: {
      hostname: "localhost",
      baseUrl: "http://localhost:8080",
    },
    ...overrides.config,
  };

  return new Reflector({
    config,
    httpApi: overrides.httpApi,
    httpsApi: overrides.httpsApi,
    wsApi: overrides.wsApi,
    fsApi: overrides.fsApi || {
      existsSync: () => true,
      readFileSync: () => Buffer.from("hello"),
    },
    tlsApi: overrides.tlsApi,
    chokidarApi: overrides.chokidarApi || {
      watch: () => ({
        on: () => {},
        off: () => {},
      }),
    },
  });
}

// ================================================================
// loadCertificates
// ================================================================

test("loadCertificates reads certificate and key", () => {
  const fsApi = {
    readFileSync(file) {
      if (file === "cert.pem") return Buffer.from("CERT");
      if (file === "key.pem") return Buffer.from("KEY");
      throw new Error("unexpected file");
    },
  };

  const reflector = makeReflector({ fsApi });
  assert.deepEqual(reflector.loadCertificates("cert.pem", "key.pem"), {
    cert: Buffer.from("CERT"),
    key: Buffer.from("KEY"),
  });
});

// ================================================================
// litmdConfigForRequest (pure function from reflector-core.js)
// ================================================================

test("litmdConfigForRequest returns default config with documentRoot", () => {
  const config = {
    hostname: "localhost",
    documentRoot: "/site",
    hostnames: null,
    litmd: { baseUrl: "http://localhost:8080" },
  };

  const result = litmdConfigForRequest(config);
  assert.equal(result.documentRoot, "/site");
  assert.equal(result.hostname, "localhost");
});

test("litmdConfigForRequest selects hostname-specific documentRoot", () => {
  const config = {
    hostname: "localhost",
    documentRoot: "/default",
    hostnames: [
      { hostname: "example.com", documentRoot: "/example" },
    ],
    litmd: { baseUrl: "https://example.com" },
  };

  const req = { headers: { host: "example.com:8080" } };
  const result = litmdConfigForRequest(config, req);
  assert.equal(result.documentRoot, "/example");
  assert.equal(result.hostname, "example.com");
});

// ================================================================
// httpRedirectServerLogic
// ================================================================

test("httpRedirectServerLogic redirects normal requests to HTTPS", () => {
  const reflector = makeReflector();
  const res = makeResponse();

  reflector.httpRedirectServerLogic(
    makeRequest("/hello", { headers: { host: "example.com:8080" } }),
    res,
  );

  assert.equal(res.status, 308);
  assert.equal(res.headers.Location, "https://example.com:8443/hello");
});

test("httpRedirectServerLogic serves ACME challenge", () => {
  const fsApi = {
    existsSync: () => true,
    readFileSync(file) {
      assert.ok(file.includes(".well-known/acme-challenge/token"));
      return Buffer.from("secret");
    },
  };

  const reflector = makeReflector({ fsApi });
  const res = makeResponse();

  reflector.httpRedirectServerLogic(
    makeRequest("/.well-known/acme-challenge/token"),
    res,
  );

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, Buffer.from("secret"));
});

test("httpRedirectServerLogic returns 404 for invalid ACME path", () => {
  const reflector = makeReflector();
  const res = makeResponse();

  reflector.httpRedirectServerLogic(
    makeRequest("/.well-known/acme-challenge/a/b"),
    res,
  );

  assert.equal(res.status, 404);
});

// ================================================================
// handleFileRequest
// ================================================================

test("handleFileRequest returns 204 for favicon.ico", () => {
  const reflector = makeReflector();
  const res = makeResponse();

  const result = reflector.handleFileRequest(
    makeRequest("/favicon.ico"),
    res,
  );

  assert.equal(res.status, 204);
  assert.equal(result.status, 204);
});

test("handleFileRequest returns status info", () => {
  const reflector = makeReflector();
  reflector.gitCommit = "abc123";
  const res = makeResponse();

  const result = reflector.handleFileRequest(
    makeRequest("/status"),
    res,
  );

  assert.equal(res.status, 200);
  const status = JSON.parse(res.body);
  assert.equal(status.git, "abc123");
  assert.equal(status.hostname, "localhost");
});

test("handleFileRequest requires user-agent", () => {
  const reflector = makeReflector();
  const res = makeResponse();

  const result = reflector.handleFileRequest(
    { url: "/foo", headers: {}, socket: {} },
    res,
  );

  assert.equal(res.status, 500);
  assert.equal(result.status, 500);
});

test("handleFileRequest serves a file", () => {
  const fsApi = {
    existsSync(file) {
      return file === "/site/foo.html";
    },
    readFileSync() {
      return Buffer.from("hello");
    },
  };

  const reflector = makeReflector({ fsApi });
  const res = makeResponse();

  const result = reflector.handleFileRequest(
    makeRequest("/foo"),
    res,
  );

  assert.equal(res.status, 200);
  assert.equal(result.status, 200);
});

test("handleFileRequest returns 304 for matching ETag", () => {
  const fsApi = {
    existsSync(file) {
      return file === "/site/foo.html";
    },
    readFileSync() {
      return Buffer.from("hello");
    },
  };

  const reflector = makeReflector({ fsApi, config: { useCache: false } });

  // First request to populate cache
  const res1 = makeResponse();
  reflector.handleFileRequest(makeRequest("/foo"), res1);
  const etag = res1.headers?.ETag;

  const res2 = makeResponse();
  const result = reflector.handleFileRequest(
    makeRequest("/foo", { headers: { "user-agent": "test", "if-none-match": etag } }),
    res2,
  );

  assert.equal(res2.status, 304);
  assert.equal(result.status, 304);
});

test("handleFileRequest returns 404 for missing file", () => {
  const fsApi = {
    existsSync() {
      return false;
    },
  };

  const reflector = makeReflector({ fsApi });
  const res = makeResponse();

  const result = reflector.handleFileRequest(
    makeRequest("/nonexistent"),
    res,
  );

  assert.equal(res.status, 404);
  assert.equal(result.status, 404);
  assert.ok(res.body.includes("___"));
});

// ================================================================
// failWhale
// ================================================================

test("failWhale returns ASCII art", () => {
  const reflector = makeReflector();
  assert.match(reflector.failWhale, /__|_ \|/);
});

// ================================================================
// httpEvents generator
// ================================================================

test("httpEvents produces request events containing request and response", async () => {
  const listeners = {};
  const server = {
    on(event, listener) { listeners[event] = listener; },
    off(event, listener) {
      assert.equal(listeners[event], listener);
      delete listeners[event];
    },
  };

  const events = httpEvents(server, "https");
  const nextEvent = events.next();

  const request = { url: "/hello" };
  const response = { end() {} };

  listeners.request(request, response);

  const result = await nextEvent;
  assert.deepEqual(result.value, {
    type: "request",
    protocol: "https",
    request,
    response,
  });

  await events.return();
  assert.equal(listeners.request, undefined);
});

// ================================================================
// fileEvents generator
// ================================================================

test("fileEvents converts chokidar events into typed events", async () => {
  const listeners = {};
  const watcher = {
    on(event, listener) { listeners[event] = listener; },
    off(event, listener) {
      assert.equal(listeners[event], listener);
      delete listeners[event];
    },
  };

  const events = fileEvents(watcher);
  const nextEvent = events.next();

  listeners.change("/tmp/example.js");

  const result = await nextEvent;
  assert.deepEqual(result.value, {
    type: "file-changed",
    fileName: "/tmp/example.js",
  });

  await events.return();
});

test("fileEvents preserves add, unlink and directory events", async () => {
  const listeners = {};
  const watcher = {
    on(event, listener) { listeners[event] = listener; },
    off() {},
  };

  const events = fileEvents(watcher);

  const first = events.next();
  listeners.add("/tmp/a.js");
  assert.deepEqual((await first).value, { type: "file-added", fileName: "/tmp/a.js" });

  const second = events.next();
  listeners.unlink("/tmp/a.js");
  assert.deepEqual((await second).value, { type: "file-removed", fileName: "/tmp/a.js" });

  const third = events.next();
  listeners.addDir("/tmp/new");
  assert.deepEqual((await third).value, { type: "directory-added", fileName: "/tmp/new" });

  await events.return();
});

// ================================================================
// certificateEvents generator
// ================================================================

test("certificateEvents filters chokidar events", async () => {
  const listeners = {};
  const watcher = {
    on(event, listener) { listeners[event] = listener; },
    off() {},
  };

  const events = certificateEvents(watcher);
  const next = events.next();
  listeners.change("/etc/cert.pem");

  assert.deepEqual((await next).value, {
    type: "certificate-changed",
    fileName: "/etc/cert.pem",
  });

  await events.return();
});

// ================================================================
// mergeEvents generator
// ================================================================

test("mergeEvents merges events from independent generators", async () => {
  async function* first() { yield { type: "first", value: 1 }; }
  async function* second() { yield { type: "second", value: 2 }; }

  const events = mergeEvents(first(), second());
  const received = [];
  for await (const event of events) {
    received.push(event);
  }

  assert.equal(received.length, 2);
  assert.deepEqual(
    received.sort((a, b) => a.type.localeCompare(b.type)),
    [{ type: "first", value: 1 }, { type: "second", value: 2 }],
  );
});

test("mergeEvents continues after one generator completes", async () => {
  async function* first() { yield "a"; }
  async function* second() { yield "b"; yield "c"; }

  const events = mergeEvents(first(), second());
  const received = [];
  for await (const event of events) {
    received.push(event);
  }

  assert.deepEqual(received.sort(), ["a", "b", "c"]);
});

// ================================================================
// handleHttpRequestEvent (integration)
// ================================================================

test("handleHttpRequestEvent redirects HTTP to HTTPS when useTls is true", async () => {
  const reflector = makeReflector({
    config: { useTls: true },
  });

  const res = makeResponse();
  const event = {
    protocol: "http",
    request: makeRequest("/hello", { headers: { host: "example.com:8080" } }),
    response: res,
  };

  await reflector.handleHttpRequestEvent(event);
  assert.equal(res.status, 308);
  assert.ok(res.headers.Location.startsWith("https://"));
});

test("handleHttpRequestEvent serves files when TLS is off", async () => {
  const fsApi = {
    existsSync(file) { return file === "/site/index.html"; },
    readFileSync() { return Buffer.from("<h1>hello</h1>"); },
  };

  const reflector = makeReflector({ fsApi });
  const res = makeResponse();
  const event = {
    protocol: "http",
    request: makeRequest("/index.html"),
    response: res,
  };

  await reflector.handleHttpRequestEvent(event);
  assert.equal(res.status, 200);
});

// ================================================================
// invalidateFile
// ================================================================

test("invalidateFile removes cache entry", () => {
  const reflector = makeReflector();
  reflector.cache["/site/foo.html"] = Buffer.from("cached");

  reflector.invalidateFile("/site/foo.html");
  assert.equal(reflector.cache["/site/foo.html"], undefined);
});

test("invalidateFile handles relative paths", () => {
  const reflector = makeReflector();
  const absolutePath = process.cwd() + "/foo.html";
  reflector.cache[absolutePath] = Buffer.from("cached");

  reflector.invalidateFile("foo.html");
  assert.equal(reflector.cache[absolutePath], undefined);
});