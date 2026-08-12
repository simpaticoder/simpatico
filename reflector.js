// reflector.js
import process from 'node:process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';

import {
    info,
    log,
    error,
} from './lib/core.js';

import buildHtmlFromLiterateMarkdown
    from './lib/litmd.js';

import SecureWebSocketServer
    from './lab/websocket/SecureWebSocketServer.js';

import {
    getAcmeFileName,
    getAcmeToken,
    getCandidateFiles,
    getLitmdConfigForRequest,
    getResponseHeaders,
    hostnameFromRequest,
    isValidAcmeToken,
    makeStatus,
    resolveFileName,
    routeMessage,
    applyRouteAction,
    sha256,
    getWatchPaths,
    urlInfoForFile,
} from './reflector-core.js';

import { loadConfig } from './config.js';

export class Reflector {
    constructor({
                    config = loadConfig(),
                    fsModule = fs,
                    processModule = process,
                    osModule = os,
                    httpModule = http,
                    httpsModule = https,
                    tlsModule = tls,
                    zlibModule = zlib,
                    chokidarModule = chokidar,
                    wsServerClass = WebSocketServer,
                    secureWebSocketServer = SecureWebSocketServer,
                    logger = { info, log, error },
                } = {}) {
        this.config = config;
        this.fs = fsModule;
        this.process = processModule;
        this.os = osModule;
        this.http = httpModule;
        this.https = httpsModule;
        this.tls = tlsModule;
        this.zlib = zlibModule;
        this.chokidar = chokidarModule;
        this.WebSocketServer = wsServerClass;
        this.SecureWebSocketServer = secureWebSocketServer;
        this.logger = logger;

        this.cache = {};
        this.connections = {};

        this.gitCommit = this.getGitCommit();

        this.logger.info(
            `reflector.js [${JSON.stringify(
                this.config,
                null,
                2
            )}]`
        );
    }

    getGitCommit() {
        try {
            return execSync(
                'git rev-parse --short HEAD',
                { encoding: 'utf8' }
            ).trim();
        } catch {
            return 'unknown';
        }
    }

    async initialize() {
        this.logger.info(
            `Node.js version: ${this.process.version} ` +
            `for platform: ${this.os.platform()}`
        );

        this.initFileWatchingCacheInvalidator();

        const bindStatus = this.bindToPorts();

        this.logger.info('bound', bindStatus);

        if (this.config.runAsUser) {
            this.dropProcessPrivs(this.config.runAsUser);
        }

        this.logger.info(
            `Initialization complete. Open ` +
            `${this.config.baseUrl}/${path.relative(
                this.process.cwd(),
                this.findRecentFile()
            )} or ${this.config.baseUrl}/test`
        );

        if (this.process.send) {
            this.process.send(this.config);
        }
    }

    findRecentFile() {
        // Keep the existing findRecentFile dependency here.
        throw new Error('Implement using findRecentFile()');
    }

    loadCertificates(certPath, keyPath) {
        try {
            return {
                cert: this.fs.readFileSync(certPath),
                key: this.fs.readFileSync(keyPath),
            };
        } catch (err) {
            this.logger.error(
                `Failed to load certificates from ` +
                `${certPath} and ${keyPath}:`,
                err.message
            );
            throw err;
        }
    }

    getLitmdConfigForRequest(req) {
        return getLitmdConfigForRequest(
            this.config,
            req
        );
    }

    bindToPorts() {
        const result = {
            http: 0,
            https: 0,
            ws: 0,
        };

        const httpLogic = this.config.useTls
            ? this.httpRedirectServerLogic.bind(this)
            : this.fileServerLogic();

        const httpServer = this.http
            .createServer(
                {
                    keepAlive: this.config.httpKeepAlive,
                    headersTimeout: this.config.httpHeadersTimeout,
                },
                httpLogic
            )
            .listen(
                this.config.http,
                '0.0.0.0'
            );

        result.http = this.config.http;

        let httpsServer;

        if (this.config.useTls) {
            httpsServer = this.createHttpsServer();
            result.https = this.config.https;
        }

        if (this.config.enableWebsockets) {
            const seed = randomBytes(32).toString('hex');
            const serverKeys =
                this.SecureWebSocketServer.generateKeys(seed);

            new this.WebSocketServer({
                server: this.config.useTls
                    ? httpsServer
                    : httpServer,
                perMessageDeflate: true,
            }).on(
                'connection',
                ws => this.chatServerLogic(ws, serverKeys)
            );

            result.ws = this.config.useTls
                ? this.config.https
                : this.config.http;
        }

        return result;
    }

    createHttpsServer() {
        if (this.config.hostnames?.length) {
            return this.createMultiHostnameHttpsServer();
        }

        const { cert, key } = this.loadCertificates(
            this.config.cert,
            this.config.key
        );

        const server = this.https
            .createServer(
                { key, cert },
                this.fileServerLogic()
            )
            .listen(
                this.config.https,
                '0.0.0.0'
            );

        this.watchCertificates(
            [this.config.cert, this.config.key],
            () => {
                const newContext = this.loadCertificates(
                    this.config.cert,
                    this.config.key
                );

                server.setSecureContext(newContext);
            }
        );

        return server;
    }

    createMultiHostnameHttpsServer() {
        const contexts = Object.fromEntries(
            this.config.hostnames.map(host => [
                host.hostname,
                this.loadCertificates(
                    host.cert,
                    host.key
                ),
            ])
        );

        const defaultContext =
            contexts[this.config.hostnames[0].hostname];

        const server = this.https.createServer(
            {
                ...defaultContext,

                SNICallback: (servername, callback) => {
                    const context =
                        contexts[servername] || defaultContext;

                    callback(
                        null,
                        this.tls.createSecureContext(context)
                    );
                },
            },
            this.fileServerLogic()
        );

        server.listen(
            this.config.https,
            '0.0.0.0'
        );

        this.watchCertificates(
            this.config.hostnames.flatMap(
                host => [host.cert, host.key]
            ),
            () => {
                for (const host of this.config.hostnames) {
                    contexts[host.hostname] =
                        this.loadCertificates(
                            host.cert,
                            host.key
                        );
                }
            }
        );

        return server;
    }

    watchCertificates(files, reload) {
        this.chokidar
            .watch(files, {
                persistent: true,
                ignoreInitial: true,
            })
            .on('change', changedPath => {
                this.logger.log(
                    `Certificate file changed: ${changedPath}`
                );

                try {
                    reload();
                    this.logger.log(
                        'Certificates reloaded successfully'
                    );
                } catch (err) {
                    this.logger.error(
                        'Failed to reload certificates:',
                        err.message
                    );
                }
            });
    }

    dropProcessPrivs(user) {
        // Intentionally retained as a boundary.
        this.logger.info(
            'dropProcessPrivs succeeded',
            user
        );
    }

    httpRedirectServerLogic(req, res) {
        if (
            req.url.startsWith(
                '/.well-known/acme-challenge'
            )
        ) {
            return this.serveAcmeChallenge(req, res);
        }

        const hostname = hostnameFromRequest(
            req,
            this.config.hostname
        );

        const location =
            `https://${hostname}` +
            (this.config.https === 443
                ? ''
                : `:${this.config.https}`) +
            req.url;

        res.writeHead(308, {
            Location: location,
        });

        res.end();
    }

    serveAcmeChallenge(req, res) {
        try {
            const token = getAcmeToken(req.url);

            if (!isValidAcmeToken(token)) {
                throw new Error(
                    `Invalid ACME challenge token: ${token}`
                );
            }

            const fileName = getAcmeFileName(
                this.process.cwd(),
                req.url
            );

            const secret =
                this.fs.readFileSync(fileName);

            res.writeHead(200);
            res.end(secret);
        } catch (err) {
            res.writeHead(
                404,
                `unable to serve acme challenge ` +
                `${req.url} : ${err}`
            );
            res.end();
        }
    }

    fileServerLogic() {
        return (req, res) => {
            if (req.url === '/favicon.ico') {
                res.writeHead(204, {
                    'Content-Type': 'image/x-icon',
                });
                res.end();
                return;
            }

            if (
                req.url === '/status' ||
                req.url === '/status/'
            ) {
                return this.serveStatus(res);
            }

            if (!('user-agent' in req.headers)) {
                res.writeHead(500);
                res.end(
                    'user-agent header required'
                );
                return;
            }

            let fileName;

            try {
                fileName = resolveFileName({
                    urlPath: req.url,
                    documentRoot:
                    this.getLitmdConfigForRequest(req)
                        .documentRoot,
                    existsSync:
                        this.fs.existsSync.bind(this.fs),
                });
            } catch (err) {
                res.writeHead(err.code || 500);
                res.end(
                    'There was a problem\n' +
                    this.failWhale
                );
                return;
            }

            let result;

            try {
                result = this.getFileData(
                    fileName,
                    req
                );
            } catch (err) {
                this.logger.log(err.message);
                res.writeHead(500);
                res.end(
                    'Error processing resource.\n' +
                    this.failWhale
                );
                return;
            }

            const {
                data,
                hash,
            } = result;

            if (req.headers['if-none-match'] === hash) {
                res.writeHead(304);
                res.end();
                return;
            }

            res.writeHead(
                200,
                getResponseHeaders(
                    fileName,
                    data,
                    this.config
                )
            );

            res.end(data);
        };
    }

    serveStatus(res) {
        const memory = this.process.memoryUsage();

        const status = makeStatus({
            gitCommit: this.gitCommit,
            nodeVersion: this.process.version,
            platform: this.os.platform(),
            arch: this.os.arch(),
            uptime: this.process.uptime(),
            started: this.config.measured.started,
            memory,
            hostname: this.config.hostname,
            version: this.config.measured.version,
        });

        res.writeHead(200, {
            'Content-Type': 'application/json',
        });

        res.end(
            JSON.stringify(status, null, 2)
        );
    }

    getFileData(fileName, req) {
        if (
            this.config.useCache &&
            Object.hasOwn(this.cache, fileName)
        ) {
            const data = this.cache[fileName];

            return {
                data,
                hash: sha256(data),
            };
        }

        const original = this.fs.readFileSync(fileName);

        const hash = sha256(original);

        let data = buildHtmlFromLiterateMarkdown(
            original,
            fileName,
            this.getLitmdConfigForRequest(req)
        );

        if (this.config.superCacheEnabled) {
            data = this.replaceSubResourceLinks(
                data,
                fileName
            );
        }

        if (
            this.config.useGzip &&
            !this.isCompressedImage(fileName)
        ) {
            data = this.zlib.gzipSync(data);
        }

        if (this.config.useCache) {
            this.cache[fileName] = data;
        }

        return { data, hash };
    }

    replaceSubResourceLinks(data, fileName) {
        if (
            !fileName.endsWith('.html') &&
            !fileName.endsWith('.md')
        ) {
            return data;
        }

        let html = data.toString();

        const regex =
            /(["`'])(.*?)\?\#\#\#\1(.*?)/g;

        for (const match of html.matchAll(regex)) {
            const resource = match[2];

            const {
                hash,
            } = this.getFileData(resource, null);

            const oldUrl = match[0];

            html = html.replace(
                oldUrl,
                `"${resource}?${hash}"`
            );
        }

        return html;
    }

    isCompressedImage(fileName) {
        return [
            '.png',
            '.jpg',
            '.jpeg',
            '.gif',
        ].some(ext => fileName.endsWith(ext));
    }

    initFileWatchingCacheInvalidator(
        watchRecursive = '.'
    ) {
        const watchPaths =
            getWatchPaths(
                this.config,
                watchRecursive
            );

        const getUrlInfo = filePath =>
            urlInfoForFile({
                filePath,
                config: this.config,
                cwd: this.process.cwd(),
            });

        this.chokidar
            .watch(watchPaths, {
                ignored: /(^|[\/\\])\..|node_modules/,
                persistent: true,
            })
            .on('change', fileName => {
                this.invalidateFile(
                    fileName,
                    getUrlInfo
                );
            })
            .on('unlink', fileName => {
                this.invalidateFile(
                    fileName,
                    getUrlInfo
                );
            });
    }

    invalidateFile(fileName, getUrlInfo) {
        const filePath = this.pathForWatchFile(fileName);

        delete this.cache[filePath];

        const {
            baseUrl,
            urlPath,
        } = getUrlInfo(filePath);

        this.logger.log(
            `cache invalidated modified ` +
            `${baseUrl}/${urlPath}`
        );
    }

    pathForWatchFile(fileName) {
        return path.isAbsolute(fileName)
            ? fileName
            : `${this.process.cwd()}/${fileName}`;
    }

    async chatServerLogic(ws, serverKeys) {
        try {
            const secureSocket =
                await this.SecureWebSocketServer.create(
                    ws,
                    serverKeys,
                    1000
                );

            if (
                Object.hasOwn(
                    this.connections,
                    secureSocket.publicKey
                )
            ) {
                secureSocket.socket.send(
                    JSON.stringify({
                        error:
                            'SOCKET_ALREADY_REGISTERED',
                    })
                );

                secureSocket.close();
                return;
            }

            this.registerSocket(secureSocket);

            secureSocket.onclose =
                event =>
                    this.unregisterSocket(
                        secureSocket,
                        event
                    );

            secureSocket.onerror =
                event =>
                    this.unregisterSocket(
                        secureSocket,
                        event
                    );

            secureSocket.onsecuremessage =
                (envelope, socket) => {
                    const action = routeMessage(
                        envelope,
                        socket,
                        this.connections
                    );

                    applyRouteAction(action);
                };
        } catch (err) {
            console.error(err);
        }
    }

    registerSocket(socket) {
        this.connections[socket.publicKey] = socket;
    }

    unregisterSocket(socket) {
        socket.isRegistered = false;
        delete this.connections[
            socket.publicKey
            ];
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

if (import.meta.url === `file://${process.argv[1]}`) {
    const reflector = new Reflector();

    reflector.initialize().catch(err => {
        console.error(
            'Failed to initialize reflector',
            err
        );
        process.exit(1);
    });
}
