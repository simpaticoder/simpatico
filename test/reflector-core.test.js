import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import {
  MIME_TYPES,
  DEFAULT_CONFIG,
  sha256,
  isCompressedImage,
  getCandidateFiles,
  hostnameFromRequest,
  documentRootForRequest,
  litmdConfigForRequest,
  urlToFileName,
  getContentTypeHeaders,
  getCacheHeaders,
  getCrossOriginHeaders,
  getContentSecurityPolicyHeaders,
  getResponseHeaders,
  getRedirectUrl,
  getAcmeToken,
  getAcmeFileName,
  getWatchPaths,
  getFileUrlInfo,
  makeStatus,
  buildBaseUrl,
  buildLitmdConfig,
  mergeConfig,
  makeCacheEntry,
  replaceSubResourceLinks,
} from "../reflector-core.js";

// ================================================================
// sha256
// ================================================================

test("sha256 returns a deterministic SHA-256 hash", () => {
  assert.equal(
    sha256("hello"),
    "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  );
});

test("sha256 accepts buffers", () => {
  assert.equal(sha256(Buffer.from("hello")), sha256("hello"));
});

// ================================================================
// isCompressedImage
// ================================================================

test("isCompressedImage recognizes png", () => {
  assert.equal(isCompressedImage("image.png"), true);
});

test("isCompressedImage recognizes jpg", () => {
  assert.equal(isCompressedImage("image.jpg"), true);
});

test("isCompressedImage recognizes jpeg", () => {
  assert.equal(isCompressedImage("image.jpeg"), true);
});

test("isCompressedImage recognizes gif", () => {
  assert.equal(isCompressedImage("image.gif"), true);
});

test("isCompressedImage rejects non-image resources", () => {
  assert.equal(isCompressedImage("index.html"), false);
  assert.equal(isCompressedImage("script.js"), false);
  assert.equal(isCompressedImage("image.webp"), false);
});

// ================================================================
// getCandidateFiles
// ================================================================

test("getCandidateFiles rejects dot-prefixed path segments", () => {
  assert.throws(
    () => getCandidateFiles("/.git/config"),
    (error) => error.code === 500,
  );
});

test("getCandidateFiles returns direct path for files", () => {
  assert.deepEqual(getCandidateFiles("/app.js"), ["/app.js"]);
});

test("getCandidateFiles resolves directory paths", () => {
  assert.deepEqual(getCandidateFiles("/docs"), [
    "/docs.md",
    "/docs.html",
    "/docs/index.md",
    "/docs/index.html",
    "/docs/README.md",
  ]);
});

test("getCandidateFiles resolves trailing slash", () => {
  assert.deepEqual(getCandidateFiles("/docs/"), [
    "/docs/index.md",
    "/docs/index.html",
    "/docs/README.md",
  ]);
});

test("getCandidateFiles resolves Angular SPA routes", () => {
  assert.deepEqual(getCandidateFiles("/angular/users/42"), [
    "/lab/angular/dist/angular/browser/index.html",
  ]);
});

test("getCandidateFiles resolves Angular files directly", () => {
  assert.deepEqual(getCandidateFiles("/angular/main.js"), [
    "/lab/angular/dist/angular/browser/main.js",
  ]);
});

// ================================================================
// hostnameFromRequest
// ================================================================

test("hostnameFromRequest removes port", () => {
  const request = {
    headers: {
      host: "example.com:8080",
    },
  };

  assert.equal(hostnameFromRequest(request, "localhost"), "example.com");
});

test("hostnameFromRequest uses fallback hostname", () => {
  assert.equal(hostnameFromRequest({}, "localhost"), "localhost");
});

test("hostnameFromRequest handles IPv4-style host with port", () => {
  const request = {
    headers: {
      host: "127.0.0.1:8080",
    },
  };

  assert.equal(hostnameFromRequest(request, "localhost"), "127.0.0.1");
});

// ================================================================
// documentRootForRequest
// ================================================================

test("documentRootForRequest uses default document root", () => {
  const config = {
    documentRoot: "/srv/site",
    hostname: "localhost",
    hostnames: null,
  };

  assert.equal(documentRootForRequest(config, null), "/srv/site");
});

test("documentRootForRequest selects hostname-specific root", () => {
  const config = {
    documentRoot: "/srv/default",
    hostname: "localhost",
    hostnames: [
      {
        hostname: "one.example",
        documentRoot: "/srv/one",
      },
      {
        hostname: "two.example",
        documentRoot: "/srv/two",
      },
    ],
  };

  const request = {
    headers: {
      host: "two.example:8443",
    },
  };

  assert.equal(documentRootForRequest(config, request), "/srv/two");
});

test("documentRootForRequest falls back when hostname is unknown", () => {
  const config = {
    documentRoot: "/srv/default",
    hostname: "localhost",
    hostnames: [
      {
        hostname: "one.example",
        documentRoot: "/srv/one",
      },
    ],
  };

  const request = {
    headers: {
      host: "unknown.example",
    },
  };

  assert.equal(documentRootForRequest(config, request), "/srv/default");
});

// ================================================================
// litmdConfigForRequest
// ================================================================

test("litmdConfigForRequest preserves base configuration", () => {
  const config = {
    hostname: "localhost",
    documentRoot: "/srv/site",
    hostnames: null,
    litmd: {
      baseUrl: "http://localhost:8080",
      author: "test",
    },
  };

  assert.deepEqual(litmdConfigForRequest(config), {
    baseUrl: "http://localhost:8080",
    author: "test",
    hostname: "localhost",
    documentRoot: "/srv/site",
  });
});

test("litmdConfigForRequest selects hostname configuration", () => {
  const config = {
    hostname: "localhost",
    documentRoot: "/srv/default",
    hostnames: [
      {
        hostname: "example.com",
        documentRoot: "/srv/example",
      },
    ],
    litmd: {
      baseUrl: "https://example.com",
    },
  };

  const request = {
    headers: {
      host: "example.com:443",
    },
  };

  assert.deepEqual(litmdConfigForRequest(config, request), {
    baseUrl: "https://example.com",
    hostname: "example.com",
    documentRoot: "/srv/example",
  });
});

// ================================================================
// urlToFileName
// ================================================================

test("urlToFileName returns the first existing candidate", () => {
  const existing = new Set(["/srv/site/docs.html"]);

  const config = {
    documentRoot: "/srv/site",
    hostname: "localhost",
    hostnames: null,
  };

  assert.equal(
    urlToFileName({
      url: "/docs",
      config,
      existsSync: (file) => existing.has(file),
    }),
    "/srv/site/docs.html",
  );
});

test("urlToFileName strips query parameters", () => {
  const config = {
    documentRoot: "/srv/site",
    hostname: "localhost",
    hostnames: null,
  };

  assert.equal(
    urlToFileName({
      url: "/app.js?version=123",
      config,
      existsSync: (file) => file === "/srv/site/app.js",
    }),
    "/srv/site/app.js",
  );
});

test("urlToFileName throws 404 when no candidate exists", () => {
  const config = {
    documentRoot: "/srv/site",
    hostname: "localhost",
    hostnames: null,
  };

  assert.throws(
    () =>
      urlToFileName({
        url: "/missing",
        config,
        existsSync: () => false,
      }),
    (error) => {
      assert.equal(error.code, 404);
      assert.deepEqual(error.candidates, [
        "/missing.md",
        "/missing.html",
        "/missing/index.md",
        "/missing/index.html",
        "/missing/README.md",
      ]);
      return true;
    },
  );
});

// ================================================================
// getContentTypeHeaders
// ================================================================

test("getContentTypeHeaders returns MIME type", () => {
  assert.deepEqual(getContentTypeHeaders("app.js", { useGzip: false }), {
    "Content-Type": "application/javascript",
    "Content-Encoding": "",
  });
});

test("getContentTypeHeaders enables gzip for compressible files", () => {
  assert.equal(
    getContentTypeHeaders("app.js", { useGzip: true })["Content-Encoding"],
    "gzip",
  );
});

test("getContentTypeHeaders disables gzip for compressed images", () => {
  assert.equal(
    getContentTypeHeaders("image.png", { useGzip: true })["Content-Encoding"],
    "",
  );
});

test("getContentTypeHeaders falls back to text", () => {
  assert.equal(
    getContentTypeHeaders("unknown.xyz", { useGzip: false })["Content-Type"],
    "text",
  );
});

// ================================================================
// getCacheHeaders
// ================================================================

test("getCacheHeaders always produces an ETag", () => {
  const data = Buffer.from("hello");

  const headers = getCacheHeaders("index.html", data);

  assert.equal(headers.ETag, sha256(data));
});

test("getCacheHeaders disables caching for HTML", () => {
  const headers = getCacheHeaders("index.html", "hello", {
    superCacheEnabled: true,
  });

  assert.equal(headers["Cache-Control"], "no-cache");
});

test("getCacheHeaders disables caching for Markdown", () => {
  const headers = getCacheHeaders("index.md", "hello", {
    superCacheEnabled: true,
  });

  assert.equal(headers["Cache-Control"], "no-cache");
});

test("getCacheHeaders enables immutable caching for subresources", () => {
  const headers = getCacheHeaders("app.js", "hello", {
    superCacheEnabled: true,
  });

  assert.equal(headers["Cache-Control"], "public, max-age=31536000, immutable");
});

// ================================================================
// Static headers
// ================================================================

test("getCrossOriginHeaders returns required isolation headers", () => {
  assert.deepEqual(getCrossOriginHeaders(), {
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  });
});

test("getContentSecurityPolicyHeaders returns CSP", () => {
  const headers = getContentSecurityPolicyHeaders();

  assert.match(headers["Content-Security-Policy"], /default-src 'self'/);

  assert.match(headers["Content-Security-Policy"], /script-src/);
});

test("getResponseHeaders combines all response headers", () => {
  const headers = getResponseHeaders("app.js", "hello", {
    useGzip: true,
    superCacheEnabled: false,
  });

  assert.equal(headers["Content-Type"], "application/javascript");

  assert.equal(headers["Content-Encoding"], "gzip");

  assert.equal(headers["Cross-Origin-Opener-Policy"], "same-origin");

  assert.ok(headers.ETag);
  assert.ok(headers["Content-Security-Policy"]);
});

// ================================================================
// Redirect / ACME
// ================================================================

test("getRedirectUrl preserves requested hostname", () => {
  const config = {
    hostname: "fallback.example",
    https: 8443,
  };

  const request = {
    url: "/hello",
    headers: {
      host: "example.com:8080",
    },
  };

  assert.equal(
    getRedirectUrl(request, config),
    "https://example.com:8443/hello",
  );
});

test("getRedirectUrl omits standard HTTPS port", () => {
  const config = {
    hostname: "localhost",
    https: 443,
  };

  const request = {
    url: "/hello",
    headers: {
      host: "example.com",
    },
  };

  assert.equal(getRedirectUrl(request, config), "https://example.com/hello");
});

test("getAcmeToken accepts valid tokens", () => {
  assert.equal(getAcmeToken("/.well-known/acme-challenge/abc_123"), "abc_123");
});

test("getAcmeToken rejects invalid tokens", () => {
  assert.throws(
    () => getAcmeToken("/.well-known/acme-challenge/a.b"),
    /Invalid ACME challenge token/,
  );
});

test("getAcmeFileName builds path from cwd", () => {
  assert.equal(
    getAcmeFileName("/.well-known/acme-challenge/token", "/srv/site"),
    "/srv/site/.well-known/acme-challenge/token",
  );
});

// ================================================================
// Watch paths
// ================================================================

test("getWatchPaths uses document root in single-host mode", () => {
  const config = {
    documentRoot: "/srv/site",
    hostnames: null,
  };

  assert.deepEqual(getWatchPaths(config), ["/srv/site"]);
});

test("getWatchPaths uses hostname document roots", () => {
  const config = {
    documentRoot: "/srv/default",
    hostnames: [
      {
        hostname: "one.example",
        documentRoot: "/srv/one",
      },
      {
        hostname: "two.example",
        documentRoot: "/srv/two",
      },
    ],
  };

  assert.deepEqual(getWatchPaths(config), ["/srv/one", "/srv/two"]);
});

test("getWatchPaths falls back when hostname roots are absent", () => {
  const config = {
    hostnames: [
      {
        hostname: "one.example",
      },
    ],
  };

  assert.deepEqual(getWatchPaths(config, "/fallback"), ["/fallback"]);
});

// ================================================================
// getFileUrlInfo
// ================================================================

test("getFileUrlInfo handles single-host mode", () => {
  const config = {
    documentRoot: "/srv/site",
    baseUrl: "http://localhost:8080",
    hostnames: null,
  };

  assert.deepEqual(getFileUrlInfo("/srv/site/index.html", config, "/srv"), {
    baseUrl: "http://localhost:8080",
    urlPath: "index.html",
  });
});

test("getFileUrlInfo identifies hostname-specific root", () => {
  const config = {
    useTls: true,
    https: 8443,
    documentRoot: "/srv/default",
    baseUrl: "https://default.example:8443",
    hostnames: [
      {
        hostname: "example.com",
        documentRoot: "/srv/example",
      },
    ],
  };

  assert.deepEqual(getFileUrlInfo("/srv/example/app.js", config, "/srv"), {
    baseUrl: "https://example.com:8443",
    urlPath: "app.js",
  });
});

// ================================================================
// makeStatus
// ================================================================

test("makeStatus builds runtime status", () => {
  const config = {
    hostname: "example.com",
    measured: {
      started: "Tue, 11 Aug 2026 00:00:00 GMT",
      version: "1.2.3",
    },
  };

  const runtime = {
    gitCommit: "abc1234",
    version: "v24.0.0",
    platform: "linux",
    arch: "x64",
    uptime: () => 12.8,
    memoryUsage: () => ({
      rss: 10 * 1024 * 1024,
      heapUsed: 5 * 1024 * 1024,
      heapTotal: 8 * 1024 * 1024,
    }),
  };

  assert.deepEqual(makeStatus(config, runtime), {
    git: "abc1234",
    node: "v24.0.0",
    platform: "linux",
    arch: "x64",
    uptime: 12,
    started: "Tue, 11 Aug 2026 00:00:00 GMT",
    memory: {
      rss: "10 MB",
      heapUsed: "5 MB",
      heapTotal: "8 MB",
    },
    hostname: "example.com",
    version: "1.2.3",
  });
});

// ================================================================
// buildBaseUrl
// ================================================================

test("buildBaseUrl builds HTTP URL", () => {
  assert.equal(
    buildBaseUrl({
      hostname: "example.com",
      http: 8080,
      https: 8443,
      useTls: false,
      hostnames: null,
    }),
    "http://example.com:8080",
  );
});

test("buildBaseUrl omits HTTP port 80", () => {
  assert.equal(
    buildBaseUrl({
      hostname: "example.com",
      http: 80,
      https: 8443,
      useTls: false,
      hostnames: null,
    }),
    "http://example.com",
  );
});

test("buildBaseUrl builds HTTPS URL", () => {
  assert.equal(
    buildBaseUrl({
      hostname: "example.com",
      http: 8080,
      https: 8443,
      useTls: true,
      hostnames: null,
    }),
    "https://example.com:8443",
  );
});

test("buildBaseUrl uses first hostname in multi-host mode", () => {
  assert.equal(
    buildBaseUrl({
      hostname: "fallback.example",
      http: 8080,
      https: 443,
      useTls: true,
      hostnames: [
        { hostname: "first.example" },
        { hostname: "second.example" },
      ],
    }),
    "https://first.example",
  );
});

// ================================================================
// buildLitmdConfig
// ================================================================

test("buildLitmdConfig creates litmd configuration", () => {
  const config = {
    hostname: "example.com",
    baseUrl: "https://example.com",
    hostnames: null,
  };

  const packageJson = {
    name: "my-project",
  };

  const now = new Date("2026-08-11T00:00:00Z");

  assert.deepEqual(buildLitmdConfig(config, packageJson, now), {
    hostname: "example.com",
    specialPathPrefix: "/",
    baseUrl: "https://example.com",
    author: "my-project",
    keywords: "es6, minimalist, vanillajs, notebook",
    copyrightHolder: "my-project",
    copyrightYear: 2026,
  });
});

// ================================================================
// mergeConfig
// ================================================================

test("mergeConfig gives later configuration sources priority", () => {
  const combine = (objects, resolver) => {
    const result = {};

    for (const object of objects) {
      for (const [key, value] of Object.entries(object)) {
        if (value === undefined) continue;

        const previous = result[key];

        result[key] =
          previous === undefined ? value : (resolver(previous, value) ?? value);
      }
    }

    return result;
  };

  assert.deepEqual(
    mergeConfig(
      { port: 8080 },
      { port: 9000 },
      { port: "9001" },
      { port: 9002 },
      {},
      combine,
    ),
    {
      port: 9002,
    },
  );
});

test("mergeConfig casts numeric environment values", () => {
  const combine = (objects, resolver) => {
    let result = {};

    for (const object of objects) {
      for (const [key, value] of Object.entries(object)) {
        if (value === undefined) continue;

        const previous = result[key];

        result = {
          ...result,
          [key]:
            previous === undefined
              ? value
              : (resolver(previous, value) ?? value),
        };
      }
    }

    return result;
  };

  assert.equal(
    mergeConfig({ port: 8080 }, {}, { port: "9000" }, {}, {}, combine).port,
    9000,
  );
});

test("mergeConfig casts boolean environment values", () => {
  const combine = (objects, resolver) => {
    const result = {};

    for (const object of objects) {
      for (const [key, value] of Object.entries(object)) {
        if (value === undefined) continue;

        result[key] =
          result[key] === undefined
            ? value
            : (resolver(result[key], value) ?? value);
      }
    }

    return result;
  };

  assert.equal(
    mergeConfig({ debug: false }, {}, { debug: "true" }, {}, {}, combine).debug,
    true,
  );
});

// ================================================================
// makeCacheEntry
// ================================================================

test("makeCacheEntry creates data and hash", () => {
  const entry = makeCacheEntry("hello");

  assert.equal(entry.data, "hello");
  assert.equal(entry.hash, sha256("hello"));
});

test("makeCacheEntry accepts an explicit hash", () => {
  assert.deepEqual(makeCacheEntry("hello", "abc"), {
    data: "hello",
    hash: "abc",
  });
});

// ================================================================
// replaceSubResourceLinks
// ================================================================

test("replaceSubResourceLinks ignores non-document resources", () => {
  assert.equal(
    replaceSubResourceLinks(
      "hello",
      () => ({
        hash: "abc",
      }),
      "script.js",
    ),
    "hello",
  );
});

test("replaceSubResourceLinks replaces resource placeholders", () => {
  const html = `<script src="/app.js?###"></script>`;

  const result = replaceSubResourceLinks(
    html,
    (resource) => {
      assert.equal(resource, "/app.js");

      return {
        hash: "deadbeef",
      };
    },
    "index.html",
  );

  assert.equal(result, `<script src="/app.js?deadbeef"></script>`);
});

// ================================================================
// Constants
// ================================================================

test("MIME_TYPES contains expected common types", () => {
  assert.equal(MIME_TYPES.html, "text/html");

  assert.equal(MIME_TYPES.js, "application/javascript");

  assert.equal(MIME_TYPES.json, "application/json");
});

test("DEFAULT_CONFIG contains expected defaults", () => {
  assert.equal(DEFAULT_CONFIG.http, 8080);
  assert.equal(DEFAULT_CONFIG.https, 8443);
  assert.equal(DEFAULT_CONFIG.hostname, "localhost");
  assert.equal(DEFAULT_CONFIG.useTls, false);
  assert.equal(DEFAULT_CONFIG.useCache, true);
});
