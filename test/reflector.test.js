// test/reflector.test.js
import test from 'node:test';
import assert from 'node:assert/strict';

import { Reflector } from '../reflector.js';

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
        hostname: 'localhost',
        documentRoot: '/site',
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
            name: 'test',
            version: '1.0.0',
            started: 'today',
        },

        baseUrl: 'http://localhost:8080',
        litmd: {
            hostname: 'localhost',
            baseUrl: 'http://localhost:8080',
        },

        ...overrides,
    };

    return new Reflector({
        config,

        fsModule: {
            existsSync: () => true,
            readFileSync: () => Buffer.from('hello'),
        },

        processModule: {
            cwd: () => '/site',
            version: 'v24',
            uptime: () => 42,
            memoryUsage: () => ({
                rss: 10 * 1024 * 1024,
                heapUsed: 5 * 1024 * 1024,
                heapTotal: 8 * 1024 * 1024,
            }),
        },

        osModule: {
            platform: () => 'linux',
            arch: () => 'x64',
        },

        logger: {
            info() {},
            log() {},
            error() {},
        },
    });
}

test('loadCertificates reads certificate and key', () => {
    const reflector = makeReflector({
        // overridden below
    });

    reflector.fs.readFileSync = file => {
        if (file === 'cert.pem') {
            return Buffer.from('CERT');
        }

        if (file === 'key.pem') {
            return Buffer.from('KEY');
        }

        throw new Error('unexpected file');
    };

    assert.deepEqual(
        reflector.loadCertificates(
            'cert.pem',
            'key.pem'
        ),
        {
            cert: Buffer.from('CERT'),
            key: Buffer.from('KEY'),
        }
    );
});

test('getLitmdConfigForRequest delegates to pure function', () => {
    const reflector = makeReflector({
        hostnames: [
            {
                hostname: 'example.com',
                documentRoot: '/example',
            },
        ],
        documentRoot: '/default',
    });

    const result =
        reflector.getLitmdConfigForRequest({
            headers: {
                host: 'example.com:8080',
            },
        });

    assert.equal(result.hostname, 'example.com');
    assert.equal(result.documentRoot, '/example');
});

test('httpRedirectServerLogic redirects normal requests', () => {
    const reflector = makeReflector({
        https: 8443,
    });

    const res = makeResponse();

    reflector.httpRedirectServerLogic(
        {
            url: '/hello',
            headers: {
                host: 'example.com:8080',
            },
        },
        res
    );

    assert.equal(res.status, 308);
    assert.equal(
        res.headers.Location,
        'https://example.com:8443/hello'
    );
});

test('httpRedirectServerLogic serves ACME challenge', () => {
    const reflector = makeReflector();

    reflector.fs.readFileSync = file => {
        assert.equal(
            file,
            '/site/.well-known/acme-challenge/token'
        );

        return Buffer.from('secret');
    };

    const res = makeResponse();

    reflector.httpRedirectServerLogic(
        {
            url:
                '/.well-known/acme-challenge/token',
            headers: {},
        },
        res
    );

    assert.equal(res.status, 200);
    assert.deepEqual(
        res.body,
        Buffer.from('secret')
    );
});

test('httpRedirectServerLogic rejects invalid ACME token', () => {
    const reflector = makeReflector();

    const res = makeResponse();

    reflector.httpRedirectServerLogic(
        {
            url:
                '/.well-known/acme-challenge/a/b',
            headers: {},
        },
        res
    );

    assert.equal(res.status, 404);
});

test('fileServerLogic serves favicon with 204', () => {
    const reflector = makeReflector();

    const res = makeResponse();

    reflector.fileServerLogic()(
        {
            url: '/favicon.ico',
            headers: {},
        },
        res
    );

    assert.equal(res.status, 204);
});

test('fileServerLogic serves status', () => {
    const reflector = makeReflector();

    reflector.gitCommit = 'abc123';

    const res = makeResponse();

    reflector.fileServerLogic()(
        {
            url: '/status',
            headers: {},
        },
        res
    );

    assert.equal(res.status, 200);

    const status = JSON.parse(res.body);

    assert.equal(status.git, 'abc123');
    assert.equal(status.node, 'v24');
    assert.equal(status.platform, 'linux');
    assert.equal(status.arch, 'x64');
    assert.equal(status.uptime, 42);
});

test('fileServerLogic requires user-agent', () => {
    const reflector = makeReflector();

    const res = makeResponse();

    reflector.fileServerLogic()(
        {
            url: '/foo',
            headers: {},
        },
        res
    );

    assert.equal(res.status, 500);
});

test('fileServerLogic serves a file', () => {
    const reflector = makeReflector();

    reflector.fs.existsSync = file =>
        file === '/site/foo.html';

    reflector.fs.readFileSync = () =>
        Buffer.from('hello');

    // Avoid coupling this test to litmd.
    const original = reflector.getFileData.bind(reflector);

    reflector.getFileData = () => ({
        data: Buffer.from('hello'),
        hash: 'abc',
    });

    const res = makeResponse();

    reflector.fileServerLogic()(
        {
            url: '/foo',
            headers: {
                'user-agent': 'node-test',
            },
        },
        res
    );

    assert.equal(res.status, 200);
    assert.deepEqual(
        res.body,
        Buffer.from('hello')
    );

    reflector.getFileData = original;
});

test('fileServerLogic returns 304 for matching ETag', () => {
    const reflector = makeReflector();

    reflector.fs.existsSync = () => true;

    reflector.getFileData = () => ({
        data: Buffer.from('hello'),
        hash: 'abc',
    });

    const res = makeResponse();

    reflector.fileServerLogic()(
        {
            url: '/foo',
            headers: {
                'user-agent': 'node-test',
                'if-none-match': 'abc',
            },
        },
        res
    );

    assert.equal(res.status, 304);
});

test('isCompressedImage delegates correctly', () => {
    const reflector = makeReflector();

    assert.equal(
        reflector.isCompressedImage('x.png'),
        true
    );

    assert.equal(
        reflector.isCompressedImage('x.js'),
        false
    );
});

test('registerSocket stores socket by public key', () => {
    const reflector = makeReflector();

    const socket = {
        publicKey: 'abc',
    };

    reflector.registerSocket(socket);

    assert.equal(
        reflector.connections.abc,
        socket
    );
});

test('unregisterSocket removes socket', () => {
    const reflector = makeReflector();

    const socket = {
        publicKey: 'abc',
        isRegistered: true,
    };

    reflector.registerSocket(socket);
    reflector.unregisterSocket(socket);

    assert.equal(
        reflector.connections.abc,
        undefined
    );

    assert.equal(
        socket.isRegistered,
        false
    );
});

test('failWhale returns diagnostic ASCII art', () => {
    const reflector = makeReflector();

    assert.match(
        reflector.failWhale,
        /reflector/i
    );
});
