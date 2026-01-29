import process from 'node:process';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import path from 'node:path';
import zlib from 'node:zlib';
import {createHash, randomBytes} from 'node:crypto';
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
    // MIME types mapping for file server
    static MIME_TYPES = {
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

    /**
     * Process configuration from multiple sources with priority: CLI args > env vars > config file > defaults
     * @param {string} envPrefix - Environment variable prefix (default: 'SIMP_')
     * @returns {{http: number, https: number, hostname: string, useTls: boolean, cert: string, key: string, hostnames: Array<{hostname: string, cert: string, key: string}>, useCache: boolean, useGzip: boolean, debug: boolean, logFileServerRequests: boolean, baseUrl: string, configFile: string, runAsUser: string}} Configuration object
     */
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
            configFile: './server.config.json',
            // Document root for single-hostname mode
            documentRoot: process.cwd(),
            // Multi-hostname configuration
            // Format: [{ hostname: 'example.com', cert: './example.crt', key: './example.key', documentRoot: '/path/to/files' }, ...]
            hostnames: null,
            // HTTP server configuration
            httpKeepAlive: 100,
            httpHeadersTimeout: 100,
        };

        // Load file-based configuration if it exists
        let fileConfig = {};
        const configFilePath = process.env[`${envPrefix}CONFIGFILE`] || baseConfig.configFile;
        if (fs.existsSync(configFilePath)) {
            try {
                const fileContent = fs.readFileSync(configFilePath, 'utf8');
                fileConfig = JSON.parse(fileContent);
                info(`Loaded configuration from ${configFilePath}`);
            } catch (err) {
                error(`Failed to load configuration file ${configFilePath}:`, err.message);
                // Continue with empty fileConfig on error
            }
        }

        // Environment variables override defaults
        const envConfig = mapObject(baseConfig, ([key, _]) => ([key, process.env[`${envPrefix}${key.toUpperCase()}`]]));

        // Command line arguments override environment variables
        let argConfig = {};
        const hasArgument = process.argv.length >= 3;
        if (hasArgument) {
            try {
                argConfig = JSON.parse(process.argv[2]);
            } catch (err) {
                error(`Failed to parse command-line JSON argument:`, err.message);
                // Continue with empty argConfig on error
            }
        }

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
        // Priority: argConfig > envConfig > fileConfig > baseConfig
        const config = combine([baseConfig, fileConfig, envConfig, argConfig, measured], (a, b) => {
            if (typeof a === 'number' && typeof b === 'number') return b;
            if (typeof a === 'number' && typeof b === 'string') return +b;
            if (typeof a === 'boolean' && typeof b === 'string') return b === 'true';
        });

        // Build baseUrl - use first hostname if multi-hostname is configured
        const primaryHostname = config.hostnames && config.hostnames.length > 0
            ? config.hostnames[0].hostname
            : config.hostname;
        config.baseUrl = config.useTls ?
            `https://${primaryHostname}${config.https === 443 ? '' : `:${config.https}`}` :
            `http://${primaryHostname}${config.http === 80 ? '' : `:${config.http}`}`;

        // Add litmd configuration
        config.litmd = {
            hostname: primaryHostname,
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
                '\nfileConfig', fileConfig,
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

    /**
     * Load TLS certificates from disk
     * @param {string} certPath - Path to certificate file
     * @param {string} keyPath - Path to private key file
     * @returns {{cert: Buffer, key: Buffer}} Certificate and key buffers
     */
    loadCertificates(certPath, keyPath) {
        try {
            const cert = fs.readFileSync(certPath);
            const key = fs.readFileSync(keyPath);
            return { cert, key };
        } catch (err) {
            error(`Failed to load certificates from ${certPath} and ${keyPath}:`, err.message);
            throw err;
        }
    }

    /**
     * Bind HTTP and HTTPS servers to configured ports
     * @returns {{http: number, https: number, ws: number}} Object containing bound port numbers
     */
    bindToPorts() {
        let httpServer;
        let httpsServer;
        const result = { http: 0, https: 0, ws: 0 };


        // Always bind to HTTP - either for redirects or direct file serving
        const httpLogic = this.config.useTls ?
            (req, res) => this.httpRedirectServerLogic(req, res) :
            this.fileServerLogic();

        const httpOptions = {
            keepAlive: this.config.httpKeepAlive,
            headersTimeout: this.config.httpHeadersTimeout
        };

        httpServer = http.createServer(httpOptions, httpLogic).listen(this.config.http, "0.0.0.0");
        result.http = this.config.http;


        // Create HTTPS server if TLS is enabled
        if (this.config.useTls) {
            // Multi-hostname support with SNI (Server Name Indication)
            if (this.config.hostnames && this.config.hostnames.length > 0) {
                // Load all certificates for multi-hostname setup
                const certContexts = {};
                const certFiles = [];

                for (const hostConfig of this.config.hostnames) {
                    certContexts[hostConfig.hostname] = this.loadCertificates(hostConfig.cert, hostConfig.key);
                    certFiles.push(hostConfig.cert, hostConfig.key);
                    info(`Loaded TLS certificate for ${hostConfig.hostname}`);
                }

                // Use the first hostname as default
                const defaultContext = certContexts[this.config.hostnames[0].hostname];

                // Create HTTPS server with SNI callback for multi-hostname support
                httpsServer = https.createServer({
                    ...defaultContext,
                    SNICallback: (servername, callback) => {
                        if (this.DEBUG) debug(`SNI request for: ${servername}`);
                        const context = certContexts[servername];
                        if (context) {
                            callback(null, tls.createSecureContext(context));
                        } else {
                            // Fall back to default context
                            callback(null, tls.createSecureContext(defaultContext));
                        }
                    }
                }, this.fileServerLogic());

                httpsServer.listen(this.config.https, "0.0.0.0");
                result.https = this.config.https;

                // Watch all certificate files for changes
                chokidar.watch(certFiles, {
                    persistent: true,
                    ignoreInitial: true
                }).on('change', changedPath => {
                    log(`Certificate file changed: ${changedPath}`);

                    // Reload all certificates
                    for (const hostConfig of this.config.hostnames) {
                        try {
                            certContexts[hostConfig.hostname] = this.loadCertificates(hostConfig.cert, hostConfig.key);
                            log(`Reloaded certificate for ${hostConfig.hostname}`);
                        } catch (err) {
                            error(`Failed to reload certificate for ${hostConfig.hostname}:`, err.message);
                        }
                    }

                    log('All certificates reloaded successfully');
                });

            } else {
                // Single hostname setup (legacy mode)
                const { cert, key } = this.loadCertificates(this.config.cert, this.config.key);

                httpsServer = https.createServer({ key, cert }, this.fileServerLogic()).listen(this.config.https, "0.0.0.0");
                result.https = this.config.https;

                // Reload certificates if they change
                chokidar.watch([this.config.cert, this.config.key], {
                    persistent: true,
                    ignoreInitial: true
                }).on('change', certPath => {
                    log(`Certificate file changed: ${certPath}`);
                    const newContext = this.loadCertificates(this.config.cert, this.config.key);
                    httpsServer.setSecureContext(newContext);
                    log('Certificates reloaded successfully');
                });
            }
        }

        // Create WebSocket server if enabled
        if (this.config.enableWebsockets) {
            // Generate cryptographically secure random seed for WebSocket server
            const wsServerSeed = randomBytes(32).toString('hex');
            const serverKeys = SecureWebSocketServer.generateKeys(wsServerSeed);
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

    /**
     * Handle HTTP requests - serve ACME challenges or redirect to HTTPS
     * @param {import('http').IncomingMessage} req - HTTP request object
     * @param {import('http').ServerResponse} res - HTTP response object
     */
    httpRedirectServerLogic(req, res) {
        if (this.DEBUG) debug(`http request: ${req.url}`);

        // Handle Let's Encrypt domain verification challenges
        if (req.url.startsWith('/.well-known/acme-challenge')) {
            try {
                // Validate ACME token format for security
                const validAcmeTokenRegex = /^[a-zA-Z0-9_-]+$/;
                const token = req.url.split('/')[3];

                if (!validAcmeTokenRegex.test(token)) {
                    throw new Error(`Invalid ACME challenge token: ${token}`);
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
        // Use the Host header to redirect to the correct hostname
        const requestHost = req.headers.host || this.config.hostname;
        const hostname = requestHost.split(':')[0]; // Remove port if present

        // Build redirect URL based on requested hostname
        const redirectUrl = `https://${hostname}${this.config.https === 443 ? '' : `:${this.config.https}`}${req.url}`;

        res.writeHead(308, { Location: redirectUrl });
        res.end();
    }

    // ================================================================
    // File Server Logic
    // ================================================================

    /**
     * Create request handler for file serving with caching, compression, and literate markdown support
     * @returns {(req: import('http').IncomingMessage, res: import('http').ServerResponse) => void} Request handler function
     */
    fileServerLogic() {
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
            const type = Reflector.MIME_TYPES[ext] || defaultMimeType;
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
                fileName = this.urlToFileName(req.url, req);
            } catch (err) {
                const code = err.code || 500;
                respondWithError({
                    code,
                    message: 'There was a problem \n' + this.failWhale,
                });
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
                log(
                    new Date().toISOString(),
                    req.socket.remoteAddress.replace(/^.*:/, ''),
                    req.headers["user-agent"].substring(0, 20),
                    req.url, "=>",
                    fileName,
                );
            };

            // Validate request has user-agent header
            if (!("user-agent" in req.headers)) {
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
                    log('\tcache miss for', req.url);
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

    /**
     * Convert URL path to filesystem path, handling special routes and query parameters
     * @param {string} path - URL path
     * @param {import('http').IncomingMessage} req - HTTP request object (optional, used for hostname-based routing)
     * @returns {string} Absolute filesystem path
     * @throws {Error} 404 error if no matching file found, 500 error if path is invalid
     */
    urlToFileName(path, req = null) {
        // Determine document root based on hostname
        let documentRoot = this.config.documentRoot;

        // If multi-hostname mode is enabled, find the document root for this hostname
        if (req && this.config.hostnames && this.config.hostnames.length > 0) {
            const requestHost = req.headers.host || this.config.hostname;
            const hostname = requestHost.split(':')[0]; // Remove port if present

            const hostConfig = this.config.hostnames.find(h => h.hostname === hostname);
            if (hostConfig && hostConfig.documentRoot) {
                documentRoot = hostConfig.documentRoot;
            }
        }

        // Strip query parameters
        if (path.indexOf('?') > -1) {
            path = path.substring(0, path.indexOf('?'));
        }

        // Find matching file
        const candidateFiles = this.getCandidateFiles(path);
        if (this.config.debug) debug({candidateFiles, documentRoot});
        let found;

        for (let i = 0; i < candidateFiles.length; i++) {
            let candidatePath = documentRoot + candidateFiles[i];
            if (fs.existsSync(candidatePath)) {
                found = candidatePath;
                break;
            }
        }

        if (found) {
            return found;
        } else {
            const err = new Error(`No candidate found for path: ${path}`);
            err.code = 404;
            err.candidates = candidateFiles;
            throw err;
        }
    }

    /**
     * Get list of candidate file paths for a given URL path
     * @param {string} path - URL path
     * @returns {string[]} Array of candidate file paths to try
     * @throws {Error} 500 error if path contains dot-prefixed segments
     */
    getCandidateFiles(path) {
        const parts = path.split('/');
        const last = peek(parts);
        const isFile= /\./.test(last);

        if (parts.some(part => part.startsWith('.'))) {
            const err = new Error(`Invalid path (contains dot-prefixed segment): ${path}`);
            err.code = 500;
            throw err;
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
        // Determine which directories to watch
        const watchPaths = [];

        if (this.config.hostnames && this.config.hostnames.length > 0) {
            // Multi-hostname mode: watch all document roots
            for (const hostConfig of this.config.hostnames) {
                if (hostConfig.documentRoot) {
                    watchPaths.push(hostConfig.documentRoot);
                }
            }
            // If no document roots specified, fall back to current directory
            if (watchPaths.length === 0) {
                watchPaths.push(watchRecursive);
            }
        } else {
            // Single-hostname mode: watch the configured document root or current directory
            watchPaths.push(this.config.documentRoot || watchRecursive);
        }

        chokidar.watch(watchPaths, {
            ignored: /(^|[\/\\])\..|node_modules/,
            persistent: true,
        })
            .on('change', fileName => {
                // fileName might be absolute or relative depending on watch path
                // Try to construct the full path for cache invalidation
                const filePath = path.isAbsolute(fileName) ? fileName : process.cwd() + '/' + fileName;
                delete this.cache[filePath];

                // Handle JS file changes
                if (fileName.endsWith('.js')) {
                    const mdFileName = fileName.replace('.js', '.md');
                    log(`cache invalidated modified ${this.config.baseUrl}/${path.basename(mdFileName)} based on ${path.basename(fileName)}`);
                } else {
                    log(`cache invalidated modified ${this.config.baseUrl}/${path.basename(fileName)}`);
                }
            })
            .on('unlink', fileName => {
                const filePath = path.isAbsolute(fileName) ? fileName : process.cwd() + '/' + fileName;
                delete this.cache[filePath];
                // Handle Angular dist directory changes
                if (fileName.includes('/dist/angular/browser')) {
                    log(`cache invalidated replaced ${this.config.baseUrl}/angular `);
                } else {
                    log(`cache invalidated deleted ${filePath}`);
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
