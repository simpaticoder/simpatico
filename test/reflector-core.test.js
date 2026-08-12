// test/reflector-core.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    MIME_TYPES,
    sha256,
    isCompressedImage,
    getCandidateFiles,
    stripQuery,
    hostnameFromRequest,
    documentRootForHostname,
    getPrimaryHostname,
    getBaseUrl,
    getContentTypeHeaders,
    getCacheHeaders,
    getSecurityHeaders,
    getResponseHeaders,
    buildRedirectUrl,
    isValidAcmeToken,
    getAcmeToken,
    getAcmeFileName,
    makeStatus,
    parseJson,
    castConfigValue,
    mergeConfig,
    buildMeasuredConfig,
    buildLitmdConfig,
    buildConfig,
    getWatchPaths,
    urlInfoForFile,
    getLitmdConfigForRequest,
    resolveFileName,
    routeMessage,
} from '../reflector-core.js';

test('MIME_TYPES contains common types', () => {
    assert.equal(MIME_TYPES.html, 'text/html');
    assert.equal(MIME_TYPES.js, 'application/javascript');
});

test('sha256 produces deterministic hash', () => {
    assert.equal(
        sha256('hello'),
        '2cf24dba5fb0a30e26e83b2ac5b9e29e' +
        '1b161e5c1fa7425e73043362938b9824'
    );
});

test('isCompressedImage recognizes compressed images', () => {
    assert.equal(isCompressedImage('a.png'), true);
    assert.equal(isCompressedImage('a.jpg'), true);
    assert.equal(isCompressedImage('a.jpeg'), true);
    assert.equal(isCompressedImage('a.gif'), true);
    assert.equal(isCompressedImage('a.css'), false);
});

test('getCandidateFiles handles file paths', () => {
    assert.deepEqual(
        getCandidateFiles('/foo.js'),
        ['/foo.js']
    );
});

test('getCandidateFiles handles extensionless paths', () => {
    assert.deepEqual(
        getCandidateFiles('/foo'),
        [
            '/foo.md',
            '/foo.html',
            '/foo/index.md',
            '/foo/index.html',
            '/foo/README.md',
        ]
    );
});

test('getCandidateFiles handles directory paths', () => {
    assert.deepEqual(
        getCandidateFiles('/foo/'),
        [
            '/foo/index.md',
            '/foo/index.html',
            '/foo/README.md',
        ]
    );
});

test('getCandidateFiles handles Angular files', () => {
    assert.deepEqual(
        getCandidateFiles('/angular/main.js'),
        [
            '/lab/angular/dist/angular/browser/main.js',
        ]
    );
});

test('getCandidateFiles handles Angular SPA routes', () => {
    assert.deepEqual(
        getCandidateFiles('/angular/foo/bar'),
        [
            '/lab/angular/dist/angular/browser/index.html',
        ]
    );
});

test('getCandidateFiles rejects hidden path segments', () => {
    assert.throws(
        () => getCandidateFiles('/foo/.secret'),
        error => error.code === 500
    );
});

test('stripQuery removes query string', () => {
    assert.equal(
        stripQuery('/foo.html?a=1'),
        '/foo.html'
    );

    assert.equal(
        stripQuery('/foo.html'),
        '/foo.html'
    );
});

test('hostnameFromRequest uses host header', () => {
    assert.equal(
        hostnameFromRequest(
            { headers: { host: 'example.com:8080' } },
            'localhost'
        ),
        'example.com'
    );
});

test('hostnameFromRequest uses fallback', () => {
    assert.equal(
        hostnameFromRequest(
            { headers: {} },
            'localhost'
        ),
        'localhost'
    );
});

test('documentRootForHostname selects matching host', () => {
    const config = {
        documentRoot: '/default',
        hostnames: [
            {
                hostname: 'example.com',
                documentRoot: '/example',
            },
        ],
    };

    assert.equal(
        documentRootForHostname(
            config,
            'example.com'
        ),
        '/example'
    );

    assert.equal(
        documentRootForHostname(
            config,
            'other.com'
        ),
        '/default'
    );
});

test('getLitmdConfigForRequest applies hostname root', () => {
    const config = {
        hostname: 'localhost',
        documentRoot: '/default',
        hostnames: [
            {
                hostname: 'example.com',
                documentRoot: '/example',
            },
        ],
        litmd: {
            baseUrl: 'http://localhost:8080',
        },
    };

    assert.deepEqual(
        getLitmdConfigForRequest(
            config,
            {
                headers: {
                    host: 'example.com:8080',
                },
            }
        ),
        {
            baseUrl: 'http://localhost:8080',
            hostname: 'example.com',
            documentRoot: '/example',
        }
    );
});

test('getPrimaryHostname uses first configured hostname', () => {
    assert.equal(
        getPrimaryHostname({
            hostname: 'localhost',
            hostnames: [
                { hostname: 'example.com' },
            ],
        }),
        'example.com'
    );
});

test('getPrimaryHostname uses normal hostname', () => {
    assert.equal(
        getPrimaryHostname({
            hostname: 'localhost',
            hostnames: null,
        }),
        'localhost'
    );
});

test('getBaseUrl builds HTTP URL', () => {
    assert.equal(
        getBaseUrl({
            hostname: 'example.com',
            hostnames: null,
            useTls: false,
            http: 8080,
        }),
        'http://example.com:8080'
    );
});

test('getBaseUrl omits default HTTP port', () => {
    assert.equal(
        getBaseUrl({
            hostname: 'example.com',
            hostnames: null,
            useTls: false,
            http: 80,
        }),
        'http://example.com'
    );
});

test('getBaseUrl builds HTTPS URL', () => {
    assert.equal(
        getBaseUrl({
            hostname: 'example.com',
            hostnames: null,
            useTls: true,
            https: 8443,
        }),
        'https://example.com:8443'
    );
});

test('getContentTypeHeaders determines MIME type', () => {
    assert.deepEqual(
        getContentTypeHeaders(
            '/foo.js',
            { useGzip: true }
        ),
        {
            'Content-Type':
                'application/javascript',
            'Content-Encoding': 'gzip',
        }
    );
});

test('getContentTypeHeaders disables gzip for images', () => {
    assert.equal(
        getContentTypeHeaders(
            '/foo.png',
            { useGzip: true }
        )['Content-Encoding'],
        ''
    );
});

test('getCacheHeaders produces ETag', () => {
    const headers = getCacheHeaders(
        '/foo.js',
        Buffer.from('hello'),
        {
            superCacheEnabled: false,
        }
    );

    assert.equal(
        headers.ETag,
        sha256(Buffer.from('hello'))
    );

    assert.equal(
        headers['Cache-Control'],
        'no-cache'
    );
});

test('getCacheHeaders enables immutable cache for subresources', () => {
    assert.equal(
        getCacheHeaders(
            '/foo.js',
            'hello',
            { superCacheEnabled: true }
        )['Cache-Control'],
        'public, max-age=31536000, immutable'
    );
});

test('getCacheHeaders does not immutable-cache HTML', () => {
    assert.equal(
        getCacheHeaders(
            '/foo.html',
            'hello',
            { superCacheEnabled: true }
        )['Cache-Control'],
        'no-cache'
    );
});

test('getSecurityHeaders returns isolation and CSP headers', () => {
    const headers = getSecurityHeaders();

    assert.equal(
        headers['Cross-Origin-Opener-Policy'],
        'same-origin'
    );

    assert.match(
        headers['Content-Security-Policy'],
        /default-src 'self'/
    );
});

test('getResponseHeaders combines all headers', () => {
    const headers = getResponseHeaders(
        '/foo.js',
        'hello',
        {
            useGzip: true,
            superCacheEnabled: false,
        }
    );

    assert.equal(
        headers['Content-Type'],
        'application/javascript'
    );

    assert.ok(headers.ETag);
    assert.ok(headers['Content-Security-Policy']);
});

test('buildRedirectUrl builds HTTPS redirect', () => {
    assert.equal(
        buildRedirectUrl({
            hostname: 'example.com',
            port: 8443,
            url: '/foo',
        }),
        'https://example.com:8443/foo'
    );
});

test('buildRedirectUrl omits HTTPS default port', () => {
    assert.equal(
        buildRedirectUrl({
            hostname: 'example.com',
            port: 443,
            url: '/foo',
        }),
        'https://example.com/foo'
    );
});

test('isValidAcmeToken accepts valid token', () => {
    assert.equal(
        isValidAcmeToken('abc-123_XYZ'),
        true
    );
});

test('isValidAcmeToken rejects invalid token', () => {
    assert.equal(
        isValidAcmeToken('abc/123'),
        false
    );
});

test('getAcmeToken extracts token', () => {
    assert.equal(
        getAcmeToken(
            '/.well-known/acme-challenge/abc123'
        ),
        'abc123'
    );
});

test('getAcmeFileName combines cwd and URL', () => {
    assert.equal(
        getAcmeFileName(
            '/srv/site',
            '/.well-known/acme-challenge/a'
        ),
        '/srv/site/.well-known/acme-challenge/a'
    );
});

test('makeStatus formats memory sizes', () => {
    const status = makeStatus({
        gitCommit: 'abc123',
        nodeVersion: 'v24',
        platform: 'linux',
        arch: 'x64',
        uptime: 123.9,
        started: 'today',
        memory: {
            rss: 10 * 1024 * 1024,
            heapUsed: 20 * 1024 * 1024,
            heapTotal: 30 * 1024 * 1024,
        },
        hostname: 'localhost',
        version: '1.0.0',
    });

    assert.deepEqual(status, {
        git: 'abc123',
        node: 'v24',
        platform: 'linux',
        arch: 'x64',
        uptime: 123,
        started: 'today',
        memory: {
            rss: '10 MB',
            heapUsed: '20 MB',
            heapTotal: '30 MB',
        },
        hostname: 'localhost',
        version: '1.0.0',
    });
});

test('parseJson parses valid JSON', () => {
    assert.deepEqual(
        parseJson('{"a":1}', {}),
        { a: 1 }
    );
});

test('parseJson returns fallback for invalid JSON', () => {
    assert.deepEqual(
        parseJson('{', { fallback: true }),
        { fallback: true }
    );
});

test('castConfigValue converts numeric environment values', () => {
    assert.equal(
        castConfigValue(8080, '9090'),
        9090
    );
});

test('castConfigValue converts boolean environment values', () => {
    assert.equal(
        castConfigValue(true, 'false'),
        false
    );
});

test('castConfigValue preserves undefined values', () => {
    assert.equal(
        castConfigValue(123, undefined),
        123
    );
});

test('castConfigValue accepts replacement values', () => {
    assert.equal(
        castConfigValue('old', 'new'),
        'new'
    );
});

test('mergeConfig respects source priority', () => {
    assert.deepEqual(
        mergeConfig(
            { port: 1, debug: false },
            { port: 2 },
            { port: '3', debug: 'true' }
        ),
        {
            port: 3,
            debug: true,
        }
    );
});

test('buildMeasuredConfig creates measured information', () => {
    assert.deepEqual(
        buildMeasuredConfig({
            packageJson: {
                name: 'demo',
                version: '1.2.3',
            },
            argv: ['node', 'server'],
            cwd: '/tmp',
            started: 'today',
        }),
        {
            measured: {
                name: 'demo',
                version: '1.2.3',
                args: ['node', 'server'],
                cwd: '/tmp',
                started: 'today',
            },
        }
    );
});

test('buildLitmdConfig creates litmd configuration', () => {
    const config = {
        hostname: 'example.com',
        hostnames: null,
        http: 8080,
        useTls: false,
        measured: {
            name: 'Alice',
        },
    };

    assert.deepEqual(
        buildLitmdConfig(
            config,
            new Date('2026-01-01')
        ),
        {
            hostname: 'example.com',
            specialPathPrefix: '/',
            baseUrl: 'http://example.com:8080',
            author: 'Alice',
            keywords:
                'es6, minimalist, vanillajs, notebook',
            copyrightHolder: 'Alice',
            copyrightYear: 2026,
        }
    );
});

test('buildConfig combines configuration sources', () => {
    const config = buildConfig({
        defaults: {
            hostname: 'localhost',
            http: 8080,
            useTls: false,
            configFile: './server.json',
            hostnames: null,
        },
        fileConfig: {
            http: 9000,
        },
        env: {
            SIMP_HTTP: '9100',
        },
        argv: [
            'node',
            'server',
            '{"http":9200}',
        ],
        packageJson: {
            name: 'demo',
            version: '1',
        },
        cwd: '/tmp',
        started: 'today',
        now: new Date('2026-01-01'),
    });

    assert.equal(config.http, 9200);
    assert.equal(
        config.baseUrl,
        'http://localhost:9200'
    );
    assert.equal(
        config.litmd.author,
        'demo'
    );
});

test('getWatchPaths uses all hostname roots', () => {
    assert.deepEqual(
        getWatchPaths({
            documentRoot: '/default',
            hostnames: [
                { documentRoot: '/one' },
                { documentRoot: '/two' },
            ],
        }),
        ['/one', '/two']
    );
});

test('getWatchPaths falls back when roots are absent', () => {
    assert.deepEqual(
        getWatchPaths(
            {
                hostnames: [
                    { hostname: 'one' },
                ],
            },
            '.'
        ),
        ['.']
    );
});

test('urlInfoForFile resolves multi-hostname root', () => {
    const result = urlInfoForFile({
        filePath: '/sites/example/foo.md',
        cwd: '/sites',
        config: {
            useTls: false,
            http: 8080,
            baseUrl: 'http://localhost:8080',
            documentRoot: '/default',
            hostnames: [
                {
                    hostname: 'example.com',
                    documentRoot: '/sites/example',
                },
            ],
        },
    });

    assert.deepEqual(result, {
        baseUrl: 'http://example.com:8080',
        urlPath: 'foo.md',
    });
});

test('resolveFileName returns first existing candidate', () => {
    const result = resolveFileName({
        urlPath: '/foo',
        documentRoot: '/site',
        existsSync: file =>
            file === '/site/foo.html',
    });

    assert.equal(result, '/site/foo.html');
});

test('resolveFileName throws 404 when no candidate exists', () => {
    assert.throws(
        () => resolveFileName({
            urlPath: '/foo',
            documentRoot: '/site',
            existsSync: () => false,
        }),
        error => {
            assert.equal(error.code, 404);
            assert.deepEqual(error.candidates, [
                '/foo.md',
                '/foo.html',
                '/foo/index.md',
                '/foo/index.html',
                '/foo/README.md',
            ]);
            return true;
        }
    );
});

test('routeMessage rejects unknown sender', () => {
    const socket = {};

    const action = routeMessage(
        {
            from: 'A',
            to: 'B',
            type: 'MESSAGE',
            message: 'hello',
        },
        socket,
        {}
    );

    assert.equal(action.type, 'send');
    assert.equal(
        action.message.error,
        'SOCKET_NOT_REGISTERED'
    );
});

test('routeMessage rejects mismatched socket', () => {
    const registered = {};
    const actual = {};

    const action = routeMessage(
        {
            from: 'A',
            to: 'B',
            type: 'MESSAGE',
            message: 'hello',
        },
        actual,
        { A: registered }
    );

    assert.equal(
        action.message.error,
        'MISMATCHED_SOCKET_PUBLIC_KEY'
    );
});

test('routeMessage rejects missing content', () => {
    const socket = {};

    const action = routeMessage(
        {
            from: 'A',
            to: 'B',
            type: 'MESSAGE',
        },
        socket,
        { A: socket }
    );

    assert.equal(
        action.message.error,
        'MISSING_CONTENT_FIELD'
    );
});

test('routeMessage rejects incorrect message type', () => {
    const socket = {};

    const action = routeMessage(
        {
            from: 'A',
            to: 'B',
            type: 'OTHER',
            message: 'hello',
        },
        socket,
        { A: socket }
    );

    assert.equal(
        action.message.error,
        'MISSING_TYPE_MESSAGE'
    );
});

test('routeMessage rejects unavailable recipient', () => {
    const socket = {};

    const action = routeMessage(
        {
            from: 'A',
            to: 'B',
            type: 'MESSAGE',
            message: {
                text: 'hello',
            },
        },
        socket,
        { A: socket }
    );

    assert.equal(
        action.message.error,
        'RECIPIENT_NOT_AVAILABLE'
    );
});

test('routeMessage delivers valid messages', () => {
    const sender = {};
    const recipient = {};

    const action = routeMessage(
        {
            from: 'A',
            to: 'B',
            type: 'MESSAGE',
            message: {
                text: 'hello',
            },
        },
        sender,
        {
            A: sender,
            B: recipient,
        }
    );

    assert.equal(action.type, 'deliver');
    assert.equal(action.recipient, recipient);
    assert.deepEqual(action.message, {
        text: 'hello',
    });

    assert.deepEqual(
        action.confirmation.message,
        {
            text: 'hello',
            type: 'MESSAGE_DELIVERED',
        }
    );
});
