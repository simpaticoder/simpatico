// test/reflector.test.js
import test from "node:test";
import assert from "node:assert/strict";

import { Reflector } from "../reflector.js";
import {
  certificateEvents,
  fileEvents,
  httpEvents,
  mergeEvents,
} from "../reflector-generators.js";

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

    ...overrides,
  };

  return new Reflector({
    config,

    fsModule: {
      existsSync: () => true,
      readFileSync: () => Buffer.from("hello"),
    },

    processModule: {
      cwd: () => "/site",
      version: "v24",
      uptime: () => 42,
      memoryUsage: () => ({
        rss: 10 * 1024 * 1024,
        heapUsed: 5 * 1024 * 1024,
        heapTotal: 8 * 1024 * 1024,
      }),
    },

    osModule: {
      platform: () => "linux",
      arch: () => "x64",
    },

    logger: {
      info() {},
      log() {},
      error() {},
    },
  });
}

test("loadCertificates reads certificate and key", () => {
  const reflector = makeReflector({
    // overridden below
  });

  reflector.fs.readFileSync = (file) => {
    if (file === "cert.pem") {
      return Buffer.from("CERT");
    }

    if (file === "key.pem") {
      return Buffer.from("KEY");
    }

    throw new Error("unexpected file");
  };

  assert.deepEqual(reflector.loadCertificates("cert.pem", "key.pem"), {
    cert: Buffer.from("CERT"),
    key: Buffer.from("KEY"),
  });
});

test("getLitmdConfigForRequest delegates to pure function", () => {
  const reflector = makeReflector({
    hostnames: [
      {
        hostname: "example.com",
        documentRoot: "/example",
      },
    ],
    documentRoot: "/default",
  });

  const result = reflector.getLitmdConfigForRequest({
    headers: {
      host: "example.com:8080",
    },
  });

  assert.equal(result.hostname, "example.com");
  assert.equal(result.documentRoot, "/example");
});

test("httpRedirectServerLogic redirects normal requests", () => {
  const reflector = makeReflector({
    https: 8443,
  });

  const res = makeResponse();

  reflector.httpRedirectServerLogic(
    {
      url: "/hello",
      headers: {
        host: "example.com:8080",
      },
    },
    res,
  );

  assert.equal(res.status, 308);
  assert.equal(res.headers.Location, "https://example.com:8443/hello");
});

test("httpRedirectServerLogic serves ACME challenge", () => {
  const reflector = makeReflector();

  reflector.fs.readFileSync = (file) => {
    assert.equal(file, "/site/.well-known/acme-challenge/token");

    return Buffer.from("secret");
  };

  const res = makeResponse();

  reflector.httpRedirectServerLogic(
    {
      url: "/.well-known/acme-challenge/token",
      headers: {},
    },
    res,
  );

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, Buffer.from("secret"));
});

test("httpRedirectServerLogic rejects invalid ACME token", () => {
  const reflector = makeReflector();

  const res = makeResponse();

  reflector.httpRedirectServerLogic(
    {
      url: "/.well-known/acme-challenge/a/b",
      headers: {},
    },
    res,
  );

  assert.equal(res.status, 404);
});

test("fileServerLogic serves favicon with 204", () => {
  const reflector = makeReflector();

  const res = makeResponse();

  reflector.fileServerLogic()(
    {
      url: "/favicon.ico",
      headers: {},
    },
    res,
  );

  assert.equal(res.status, 204);
});

test("fileServerLogic serves status", () => {
  const reflector = makeReflector();

  reflector.gitCommit = "abc123";

  const res = makeResponse();

  reflector.fileServerLogic()(
    {
      url: "/status",
      headers: {},
    },
    res,
  );

  assert.equal(res.status, 200);

  const status = JSON.parse(res.body);

  assert.equal(status.git, "abc123");
  assert.equal(status.node, "v24");
  assert.equal(status.platform, "linux");
  assert.equal(status.arch, "x64");
  assert.equal(status.uptime, 42);
});

test("fileServerLogic requires user-agent", () => {
  const reflector = makeReflector();

  const res = makeResponse();

  reflector.fileServerLogic()(
    {
      url: "/foo",
      headers: {},
    },
    res,
  );

  assert.equal(res.status, 500);
});

test("fileServerLogic serves a file", () => {
  const reflector = makeReflector();

  reflector.fs.existsSync = (file) => file === "/site/foo.html";

  reflector.fs.readFileSync = () => Buffer.from("hello");

  // Avoid coupling this test to litmd.
  const original = reflector.getFileData.bind(reflector);

  reflector.getFileData = () => ({
    data: Buffer.from("hello"),
    hash: "abc",
  });

  const res = makeResponse();

  reflector.fileServerLogic()(
    {
      url: "/foo",
      headers: {
        "user-agent": "node-test",
      },
    },
    res,
  );

  assert.equal(res.status, 200);
  assert.deepEqual(res.body, Buffer.from("hello"));

  reflector.getFileData = original;
});

test("fileServerLogic returns 304 for matching ETag", () => {
  const reflector = makeReflector();

  reflector.fs.existsSync = () => true;

  reflector.getFileData = () => ({
    data: Buffer.from("hello"),
    hash: "abc",
  });

  const res = makeResponse();

  reflector.fileServerLogic()(
    {
      url: "/foo",
      headers: {
        "user-agent": "node-test",
        "if-none-match": "abc",
      },
    },
    res,
  );

  assert.equal(res.status, 304);
});

test("isCompressedImage delegates correctly", () => {
  const reflector = makeReflector();

  assert.equal(reflector.isCompressedImage("x.png"), true);

  assert.equal(reflector.isCompressedImage("x.js"), false);
});

test("registerSocket stores socket by public key", () => {
  const reflector = makeReflector();

  const socket = {
    publicKey: "abc",
  };

  reflector.registerSocket(socket);

  assert.equal(reflector.connections.abc, socket);
});

test("unregisterSocket removes socket", () => {
  const reflector = makeReflector();

  const socket = {
    publicKey: "abc",
    isRegistered: true,
  };

  reflector.registerSocket(socket);
  reflector.unregisterSocket(socket);

  assert.equal(reflector.connections.abc, undefined);

  assert.equal(socket.isRegistered, false);
});

test("failWhale returns diagnostic ASCII art", () => {
  const reflector = makeReflector();

  assert.match(reflector.failWhale, /reflector/i);
});

test("httpEvents produces request events containing request and response", async () => {
  const listeners = {};

  const server = {
    on(event, listener) {
      listeners[event] = listener;
    },

    off(event, listener) {
      assert.equal(listeners[event], listener);
      delete listeners[event];
    },
  };

  const events = httpEvents(server, "https");
  const nextEvent = events.next();

  const request = {
    url: "/hello",
  };

  const response = {
    end() {},
  };

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

test("fileEvents converts chokidar events into typed events", async () => {
  const listeners = {};

  const watcher = {
    on(event, listener) {
      listeners[event] = listener;
    },

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
    on(event, listener) {
      listeners[event] = listener;
    },

    off() {},
  };

  const events = fileEvents(watcher);

  const first = events.next();
  listeners.add("/tmp/a.js");

  assert.deepEqual((await first).value, {
    type: "file-added",
    fileName: "/tmp/a.js",
  });

  const second = events.next();
  listeners.unlink("/tmp/a.js");

  assert.deepEqual((await second).value, {
    type: "file-removed",
    fileName: "/tmp/a.js",
  });

  const third = events.next();
  listeners.addDir("/tmp/new");

  assert.deepEqual((await third).value, {
    type: "directory-added",
    fileName: "/tmp/new",
  });

  await events.return();
});

test("certificateEvents filters chokidar events", async () => {
  const listeners = {};

  const watcher = {
    on(event, listener) {
      listeners[event] = listener;
    },

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

test("mergeEvents merges events from independent generators", async () => {
  async function* first() {
    yield {
      type: "first",
      value: 1,
    };
  }

  async function* second() {
    yield {
      type: "second",
      value: 2,
    };
  }

  const events = mergeEvents(first(), second());

  const received = [];

  for await (const event of events) {
    received.push(event);
  }

  assert.equal(received.length, 2);

  assert.deepEqual(
    received.sort((a, b) => a.type.localeCompare(b.type)),
    [
      {
        type: "first",
        value: 1,
      },
      {
        type: "second",
        value: 2,
      },
    ],
  );
});

test("mergeEvents continues after one generator completes", async () => {
  async function* first() {
    yield "a";
  }

  async function* second() {
    yield "b";
    yield "c";
  }

  const events = mergeEvents(first(), second());

  const received = [];

  for await (const event of events) {
    received.push(event);
  }

  assert.deepEqual(received.sort(), ["a", "b", "c"]);
});
