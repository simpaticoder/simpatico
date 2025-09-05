import process from 'node:process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import zlib from 'node:zlib';
import {createHash} from 'node:crypto';
import * as os from "node:os";


import { WebSocketServer } from 'ws';
import chokidar from 'chokidar';

import { info, log, error, debug, mapObject, hasProp, peek } from './lib/core.js';
import { combine } from './lib/combine.js';
import buildHtmlFromLiterateMarkdown from './lib/litmd.js';
import { findRecentFile } from './lib/find-recent-file.js';
import SecureWebSocketServer from "./lab/websocket/SecureWebSocketServer.js";

// ================================================================
// Configuration and Initialization
// ================================================================

class Reflector {
    constructor() {
        this.DEBUG = false;
        this.cache = {};
        this.connections = {};
        this.config = this.processConfig();

        info(`reflector.js [${JSON.stringify(this.config, null, 2)}]`);
    }

    async initialize() {
        info(`Node.js version: ${process.version} for platform: ${os.platform()}`);
        this.initFileWatchingCacheInvalidator();
        const bindStatus = this.bindToPorts();
        info('bound', bindStatus);

        if (this.config.runAsUser) {
            this.dropProcessPrivs(this.config.runAsUser);
        }

        info(`Initialization complete. Open ${this.config.baseUrl}/${path.relative(process.cwd(), findRecentFile())} or ${this.config.baseUrl}/test}`);

        if (process.send) process.send(this.config);
    }

    // ================================================================
    // Configuration Processing
    // ================================================================

    processConfig(envPrefix = 'SIMP_') {
        // Default configuration
        const baseConfig = {
            http: 8080,
            https: 8443,
            hostname: 'localhost',
            cert: './fullchain.pem',
            key: './privkey.pem',
            runAsUser: '',
            useCache: true,
            useGzip: true,
            useTls: false,
            enableWebsockets: true,
            logFileServerRequests: true,
            superCacheEnabled: false,
            debug: false,
        };

        // Environment variables override defaults
        const envConfig = mapObject(baseConfig, ([key, _]) => ([key, process.env[`${envPrefix}${key.toUpperCase()}`]]));

        // Command line arguments override environment variables
        const hasArgument = process.argv.length >= 3;
        const argConfig = hasArgument ? JSON.parse(process.argv[2]) : {};

        // Add package information
        const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
        const measured = {
            measured: {
                name: packageJson.name,
                version: packageJson.version,
                args: process.argv,
                cwd: process.cwd(),
                started: new Date().toUTCString(),
            }
        };

        // Combine all configuration sources with type casting
        const config = combine([baseConfig, envConfig, argConfig, measured], (a, b) => {
            if (typeof a === 'number' && typeof b === 'number') return b;
            if (typeof a === 'number' && typeof b === 'string') return +b;
            if (typeof a === 'boolean' && typeof b === 'string') return b === 'true';
        });
        config.baseUrl = config.useTls ?
            `https://${config.hostname}${config.https === 443 ? '' : `:${config.https}`}` :
            `http://${config.hostname}${config.http === 80 ? '' : `:${config.http}`}`;

        // Add litmd configuration
        config.litmd = {
            hostname: config.hostname,
            specialPathPrefix: '/',
            baseUrl: config.baseUrl,
            author: config.measured.name,
            keywords: "es6, minimalist, vanillajs, notebook",
            copyrightHolder: config.measured.name,
            copyrightYear: new Date().getFullYear()
        };

        // Update DEBUG flag
        this.DEBUG = config.debug;

        if (this.DEBUG) {
            debug('DEBUG=true Here are all configs:',
                '\nbaseConfig', baseConfig,
                '\nenvConfig', envConfig,
                '\nmeasured', measured,
                '\nconfig', config,
            );
        }

        return config;
    }

    // ================================================================
    // Server Binding
    // ================================================================

    bindToPorts() {
        let httpServer;
        let httpsServer;
        const result = { http: 0, https: 0, ws: 0 };


        // Always bind to HTTP - either for redirects or direct file serving
        const httpLogic = this.config.useTls ?
            (req, res) => this.httpRedirectServerLogic(req, res) :
            this.fileServerLogic();

        const httpOptions = {
            keepAlive: 100,
            headersTimeout: 100
        };

        httpServer = http.createServer(httpOptions, httpLogic).listen(this.config.http, "0.0.0.0");
        result.http = this.config.http;


        // Create HTTPS server if TLS is enabled
        if (this.config.useTls) {
            const cert = fs.readFileSync(this.config.cert);
            const key = fs.readFileSync(this.config.key);

            httpsServer = https.createServer({ key, cert }, this.fileServerLogic()).listen(this.config.https, "0.0.0.0");
            result.https = this.config.https;

            // Reload certificates if they change
            chokidar.watch([this.config.cert, this.config.key], {
                persistent: true,
                ignoreInitial: true
            }).on('change', path => {
                log(`Certificate file changed: ${path}`);
                const newContext = {
                    key: fs.readFileSync(this.config.key),
                    cert: fs.readFileSync(this.config.cert)
                };
                httpsServer.setSecureContext(newContext);
                log('Certificates reloaded successfully');
            });
        }

        // Create WebSocket server if enabled
        if (this.config.enableWebsockets) {
            const serverKeys = SecureWebSocketServer.generateKeys('server-seed-456');
            new WebSocketServer({
                server: this.config.useTls ? httpsServer : httpServer,
                perMessageDeflate: true
            }).on('connection', (ws) => this.chatServerLogic(ws, serverKeys));
            result.ws = this.config.useTls ? this.config.https : this.config.http;
        }

        return result;
    }

    dropProcessPrivs(user) {
        // Important note! This method call is causing a bind error as of 8/2025.
        // process.setuid(user);
        // process.setgid(user);
        info('dropProcessPrivs succeeded', user);
    }

    // ================================================================
    // HTTP Redirect Server Logic
    // ================================================================

    httpRedirectServerLogic(req, res) {
        if (this.DEBUG) debug(`http request: ${req.url}`);

        // Handle Let's Encrypt domain verification challenges
        if (req.url.startsWith('/.well-known/acme-challenge')) {
            try {
                // Validate ACME token format for security
                const validAcmeTokenRegex = /^[a-zA-Z0-9_-]+$/;
                const token = req.url.split('/')[3];

                if (!validAcmeTokenRegex.test(token)) {
                    throw 'bad acme challenge token ' + token;
                } else {
                    const fileName = process.cwd() + req.url;
                    const localSecret = fs.readFileSync(fileName);
                    res.writeHead(200);
                    res.end(localSecret);
                }
            } catch (e) {
                const err = `unable to serve acme challenge ${req.url} : ${e}`;
                res.writeHead(404, err);
                res.end();
            }
            return;
        }

        // Redirect all other requests to HTTPS
        res.writeHead(308, { Location: this.config.baseUrl });
        res.end();
    }

    // ================================================================
    // File Server Logic
    // ================================================================

    fileServerLogic() {
        // MIME types mapping
        const mime = {
            "html": "text/html",
            "js": "application/javascript",
            "mjs": "application/javascript",
            "json": "application/json",
            "css": "text/css",
            "svg": "image/svg+xml",
            "wasm": "application/wasm",
            "pdf": "application/pdf",
            "md": "text/html",
            "png": "image/x-png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "woff2": "font/woff2",
            "xml": "application/xml",
        };

        // Headers for cross-origin isolation (needed for SharedArrayBuffer and WASM)
        const getCrossOriginHeaders = () => ({
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        });

        // Content Security Policy headers
        const getContentSecurityPolicyHeaders = () => ({
            'Content-Security-Policy': [
                "default-src 'self'",
                "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
                "style-src 'self' 'unsafe-inline'",
                "img-src 'self' data:"
            ].join(';')
        });

        // Content type headers based on file extension
        const getContentTypeHeader = (filename, defaultMimeType = 'text') => {
            const ext = path.extname(filename).slice(1);
            const type = mime[ext] ? mime[ext] : defaultMimeType;
            const useGzip = this.config.useGzip && !this.isCompressedImage(filename);
            return {
                "Content-Type": type,
                "Content-Encoding": (useGzip ? "gzip" : ""),
            };
        };

        // Cache control headers
        const getCacheHeaders = (filename, fileData) => {
            const result = {};
            const isPrimaryResource = filename.endsWith('.html') || filename.endsWith('.md');

            // ETag for conditional requests
            result["ETag"] = this.sha256(fileData);
            result["Cache-Control"] = "no-cache";

            // Immutable caching for sub-resources
            if (this.config.superCacheEnabled && !isPrimaryResource) {
                result["Cache-Control"] = "public, max-age=31536000, immutable";
            }

            return result;
        };

        return (req, res) => {
            const respondWithError = (err) => {
                res.writeHead(err.code);
                res.end(err.message);
            };

            // Check for favicon.ico request and return 204
            // we define favicon in the header, and this avoids
            // an ugly 404 in the browser console
            if (req.url === '/favicon.ico') {
                res.writeHead(204, { 'Content-Type': 'image/x-icon' });
                res.end();
                return;
            }

            // Extract filename from URL
            let fileName;
            try {
                fileName = this.urlToFileName(req.url);
            } catch (err) {
                const code = err.substring(0, 3);
                respondWithError(Object.assign(err, {
                    code,
                    message: 'There was a problem \n' + this.failWhale,
                }));
                return;
            }
            // if (this.config.debug) log({fileName});
            // Send successful response
            const respondWithData = data => {
                res.writeHead(
                    200,
                    Object.assign(
                        getContentTypeHeader(fileName),
                        getCacheHeaders(fileName, data),
                        getCrossOriginHeaders(),
                        getContentSecurityPolicyHeaders(),
                    )
                );
                res.end(data);
            };

            // Send "not modified" response
            const respondWith304 = () => {
                res.writeHead(304);
                res.end();
            };

            // Log request details
            const logRequest = req => {
                console.log(
                    new Date().toISOString(),
                    req.socket.remoteAddress.replace(/^.*:/, ''),
                    req.headers["user-agent"].substring(0, 20),
                    req.url, "=>",
                    fileName,
                );
            };

            // Validate request has user-agent header
            if (!req.headers.hasOwnProperty("user-agent")) {
                respondWithError(combine(new Error(), {
                    code: 500,
                    log: 'missing user-agent header',
                    message: 'user-agent header required',
                }));
                return;
            }

            // Log request if enabled
            if (this.config.logFileServerRequests) logRequest(req);

            // Fetch file data from cache or disk
            let data = '';
            let hash = '';

            if (this.config.useCache && hasProp(this.cache, fileName)) {
                data = this.cache[fileName];
                hash = this.sha256(data);
            } else {
                // Cache miss, read from disk
                if (this.config.useCache) {
                    console.log('\tcache miss for', req.url);
                }

                try {
                    const fromDisk = this.readProcessCache(fileName);
                    data = fromDisk.data;
                    hash = fromDisk.hash;
                } catch (err) {
                    log(err.message);
                    respondWithError(Object.assign(err, {
                        code: 500,
                        message: 'Error processing resource. \n' + this.failWhale,
                    }));
                    return;
                }
            }

            // Handle conditional request
            if (req.headers['if-none-match'] === hash) {
                respondWith304();
            } else {
                respondWithData(data);
            }
        };
    }

    // ================================================================
    // File Handling Utilities
    // ================================================================

    urlToFileName(path) {
        // Handle special URLs for package resources
        const __dirname = process.cwd();

        // Strip query parameters
        if (path.indexOf('?') > -1) {
            path = path.substring(0, path.indexOf('?'));
        }

        // Find matching file
        const candidateFiles = this.getCandidateFiles(path);
        if (this.config.debug) console.log({candidateFiles, dirname: __dirname});
        let found;

        for (let i = 0; i < candidateFiles.length; i++) {
            let candidatePath = __dirname + candidateFiles[i];
            if (fs.existsSync(candidatePath)) {
                found = candidatePath;
                break;
            }
        }

        if (found) {
            return found;
        } else {
            throw '404 no candidate found for path ' + path + ' in candidates: ' + candidateFiles;
        }
    }

    getCandidateFiles(path) {
        const parts = path.split('/');
        const last = peek(parts);
        const isFile= /\./.test(last);

        if (parts.some(part => part.startsWith('.'))) {
            throw '500 invalid path: ' + path;
        }

        // Handle Angular paths
        if (path.startsWith('/angular')) {
            const dist = '/lab/angular/dist/angular/browser';
            const subpath = path.slice('/angular'.length);

            if (isFile) {
                // ensure leading slash
                const normalized = subpath.startsWith('/') ? subpath : '/' + subpath;
                return [dist + normalized];
            }
            // Otherwise, it's an SPA route – always serve Angular index.html
            return [dist + '/index.html'];
        }

        if (path.endsWith('/')) {
            return [path + 'index.md', path + 'index.html', path + 'README.md'];
        }

        return (isFile) ?
            [path] :
            [path + '.md', path + '.html', path + '/index.md', path + '/index.html', path + '/README.md'];
    }

    readProcessCache(fileName) {
        // Read data from disk
        let data = fs.readFileSync(fileName);
        let hash = this.sha256(data);

        // 1. Convert literate markdown to HTML
        data = buildHtmlFromLiterateMarkdown(data, fileName, this.config.litmd);

        // 2. Replace sub-resource links with cache-busting URLs
        if (this.config.superCacheEnabled) {
            data = this.replaceSubResourceLinks(data, fileName);
        }

        // 3. Compress non-image resources
        if (this.config.useGzip && !this.isCompressedImage(fileName)) {
            data = zlib.gzipSync(data);
        }

        // 4. Cache the processed data
        if (this.config.useCache) {
            this.cache[fileName] = data;
        }

        return { data, hash };
    }

    replaceSubResourceLinks(maybeHTML, fileName) {
        const isHTML = fileName.endsWith('.html');
        const isMD = fileName.endsWith('.md');
        if (!isHTML && !isMD) return maybeHTML;

        let html = maybeHTML.toString();
        // Match resources with ?### placeholders
        const re = /(["`'])(.*?)\?\#\#\#\1(.*?)/g;

        let match;
        while ((match = re.exec(html)) !== null) {
            // Avoid infinite loops with zero-width matches
            if (match.index === re.lastIndex) {
                re.lastIndex++;
            }

            // Replace placeholders with resource hashes
            if (match.length === 4) {
                const url = match[0];
                const resource = match[2];
                const subResourceHash = this.readProcessCache(resource);
                const newUrl = `"${resource}?${subResourceHash}"`;
                html = html.replace(url, newUrl);
            }
        }

        return html;
    }

    sha256(data) {
        return createHash("sha256").update(data).digest("hex");
    }

    isCompressedImage(fileName) {
        return (
            fileName.endsWith('.png') ||
            fileName.endsWith('.jpg') ||
            fileName.endsWith('.jpeg') ||
            fileName.endsWith('.gif')
        );
    }

    initFileWatchingCacheInvalidator(watchRecursive = '.') {
        chokidar.watch(watchRecursive, {
            ignored: /(^|[\/\\])\..|node_modules/,
            persistent: true,
        })
            .on('change', fileName => {
                const path = process.cwd() + '/' + fileName;
                delete this.cache[path];

                // Handle JS file changes
                if (fileName.endsWith('.js')) {
                    const mdFileName = fileName.replace('.js', '.md');
                    log(`cache invalidated modified ${this.config.baseUrl}/${mdFileName} based on ${fileName}`);
                } else {
                    log(`cache invalidated modified ${this.config.baseUrl}/${fileName}`);
                }
            })
            .on('unlink', fileName => {
                const path = process.cwd() + '/' + fileName;
                delete this.cache[path];
                // Handle Angular dist directory changes
                if (fileName.includes('/dist/angular/browser')) {
                    log(`cache invalidated replaced ${this.config.baseUrl}/angular `);
                } else {
                    log(`cache invalidated deleted ${path}`);
                }

            });
    }

    // ================================================================
    // Chat Server Logic
    // ================================================================

    async chatServerLogic(ws, serverKeys) {
        try{
            const secureSocket = await SecureWebSocketServer.create(ws, serverKeys, 1000);

            // if a socket is already registered to the public key, send an error and close it.
            if (hasProp(this.connections, secureSocket.publicKey) ) {
                secureSocket.socket.send(JSON.stringify({error: "SOCKET_ALREADY_REGISTERED"}));
                secureSocket.close();
                return;
            }

            // add the socket to connections and set up its handlers.
            this.registerSocket(secureSocket);
            secureSocket.onclose = e => this.unregisterSocket(secureSocket, e);
            secureSocket.onerror = e => this.unregisterSocket(secureSocket, e);
            secureSocket.onsecuremessage = this.messageRouter;
        } catch (ex){
            console.error(ex);
        }
    }

    registerSocket(secureSocket){
        console.debug('register socket called for key ' + secureSocket.publicKey);
        this.connections[secureSocket.publicKey] = secureSocket;
    }
    unregisterSocket(secureSocket, e) {
        console.debug(`unregister socket called for key: ${secureSocket.publicKey} for reason ${e.type}`);
        secureSocket.isRegistered = false;
        delete this.connections[secureSocket.publicKey]
    }

    messageRouter(envelope, actualFromSocket){
        const {type, from, to, message} = envelope;
        const fromSocket = this.connections[from];
        const toSocket = this.connections[to];

        if (!fromSocket) {
            // this should basically never happen
            actualFromSocket.send(Object.assign(envelope, {error: "SOCKET_NOT_REGISTERED"}));
            return;
        }
        if (fromSocket !== actualFromSocket){
            // sending with a public key different from the one associated with the socket indicates a potential hacking attempt
            actualFromSocket.send(Object.assign(envelope, {error: "MISMATCHED_SOCKET_PUBLIC_KEY"}));
            return;
        }
        if (message === undefined){
            // no point in delivering an empty envelope
            actualFromSocket.send(Object.assign(envelope, {error: "MISSING_CONTENT_FIELD"}));
            return;
        }
        if (type !== "MESSAGE"){
            // somewhat arbitrary, but a missing field like this indicates potential other problems.
            actualFromSocket.send(Object.assign(envelope, {error: "MISSING_TYPE_MESSAGE"}));
            return;
        }

        if (!toSocket) {
            // this is a common situation where you try to send to a public key that isn't present.
            actualFromSocket.send(Object.assign(message, {error: "RECIPIENT_NOT_AVAILABLE"}));
            return;
        }

        // we ran the gauntlet of checks and can route the message!
        toSocket.send(message);
        // send delivery confirmation - TODO make delivery confirmation lighter-weight
        actualFromSocket.send(Object.assign(message, {type: "MESSAGE_DELIVERED"}));
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

const reflector = new Reflector();
reflector.initialize().catch(err => {
    console.error("Failed to initialize reflector", err);
    process.exit(1);
});
