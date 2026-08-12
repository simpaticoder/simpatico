// reflector-core.js
import path from 'node:path';
import { createHash } from 'node:crypto';

export const MIME_TYPES = Object.freeze({
    html: 'text/html',
    js: 'application/javascript',
    mjs: 'application/javascript',
    json: 'application/json',
    css: 'text/css',
    svg: 'image/svg+xml',
    wasm: 'application/wasm',
    pdf: 'application/pdf',
    md: 'text/html',
    png: 'image/x-png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    woff2: 'font/woff2',
    xml: 'application/xml',
});

export const DEFAULT_CONFIG = Object.freeze({
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
    documentRoot: process.cwd(),
    hostnames: null,
    httpKeepAlive: 100,
    httpHeadersTimeout: 100,
});

export function sha256(data, hash = createHash) {
    return hash('sha256').update(data).digest('hex');
}

export function isCompressedImage(fileName) {
    return ['.png', '.jpg', '.jpeg', '.gif']
        .some(extension => fileName.endsWith(extension));
}

export function getCandidateFiles(urlPath) {
    const parts = urlPath.split('/');
    const last = parts.at(-1);
    const isFile = /\./.test(last);

    if (parts.some(part => part.startsWith('.'))) {
        const error = new Error(
            `Invalid path (contains dot-prefixed segment): ${urlPath}`
        );
        error.code = 500;
        throw error;
    }

    if (urlPath.startsWith('/angular')) {
        const dist = '/lab/angular/dist/angular/browser';
        const subpath = urlPath.slice('/angular'.length);

        if (isFile) {
            const normalized = subpath.startsWith('/')
                ? subpath
                : `/${subpath}`;

            return [`${dist}${normalized}`];
        }

        return [`${dist}/index.html`];
    }

    if (urlPath.endsWith('/')) {
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

export function stripQuery(urlPath) {
    const index = urlPath.indexOf('?');
    return index === -1 ? urlPath : urlPath.slice(0, index);
}

export function hostnameFromRequest(req, fallbackHostname) {
    const host = req?.headers?.host || fallbackHostname;
    return host.split(':')[0];
}

export function documentRootForHostname(config, hostname) {
    if (!config.hostnames?.length) {
        return config.documentRoot;
    }

    const hostConfig = config.hostnames.find(
        host => host.hostname === hostname
    );

    return hostConfig?.documentRoot || config.documentRoot;
}

export function getLitmdConfigForRequest(config, req) {
    const hostname = req
        ? hostnameFromRequest(req, config.hostname)
        : config.hostname;

    return {
        ...config.litmd,
        hostname,
        documentRoot: documentRootForHostname(config, hostname),
    };
}

export function resolveFileName({
                                    urlPath,
                                    documentRoot,
                                    existsSync,
                                }) {
    const cleanPath = stripQuery(urlPath);
    const candidates = getCandidateFiles(cleanPath);

    const found = candidates
        .map(candidate => documentRoot + candidate)
        .find(existsSync);

    if (found) {
        return found;
    }

    const error = new Error(`No candidate found for path: ${cleanPath}`);
    error.code = 404;
    error.candidates = candidates;
    throw error;
}

export function getPrimaryHostname(config) {
    return config.hostnames?.length
        ? config.hostnames[0].hostname
        : config.hostname;
}

export function getBaseUrl(config) {
    const hostname = getPrimaryHostname(config);

    if (config.useTls) {
        return `https://${hostname}${
            config.https === 443 ? '' : `:${config.https}`
        }`;
    }

    return `http://${hostname}${
        config.http === 80 ? '' : `:${config.http}`
    }`;
}

export function getContentTypeHeaders(
    fileName,
    {
        useGzip,
        mimeTypes = MIME_TYPES,
    }
) {
    const extension = path.extname(fileName).slice(1);
    const type = mimeTypes[extension] || 'text';
    const gzip = useGzip && !isCompressedImage(fileName);

    return {
        'Content-Type': type,
        'Content-Encoding': gzip ? 'gzip' : '',
    };
}

export function getCacheHeaders(
    fileName,
    fileData,
    {
        superCacheEnabled,
        hash = sha256,
    }
) {
    const primaryResource =
        fileName.endsWith('.html') ||
        fileName.endsWith('.md');

    return {
        ETag: hash(fileData),
        'Cache-Control':
            superCacheEnabled && !primaryResource
                ? 'public, max-age=31536000, immutable'
                : 'no-cache',
    };
}

export function getSecurityHeaders() {
    return {
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': 'require-corp',
        'Content-Security-Policy': [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data:'",
        ].join(';'),
    };
}

export function getResponseHeaders(
    fileName,
    fileData,
    config
) {
    return {
        ...getContentTypeHeaders(fileName, config),
        ...getCacheHeaders(fileName, fileData, config),
        ...getSecurityHeaders(),
    };
}

export function buildRedirectUrl({
                                     hostname,
                                     port,
                                     url,
                                 }) {
    return `https://${hostname}${
        port === 443 ? '' : `:${port}`
    }${url}`;
}

export function isValidAcmeToken(token) {
    return /^[a-zA-Z0-9_-]+$/.test(token);
}

export function getAcmeToken(url) {
    return url.split('/')[3];
}

export function getAcmeFileName(cwd, url) {
    return `${cwd}${url}`;
}

export function makeStatus({
                               gitCommit,
                               nodeVersion,
                               platform,
                               arch,
                               uptime,
                               started,
                               memory,
                               hostname,
                               version,
                           }) {
    return {
        git: gitCommit,
        node: nodeVersion,
        platform,
        arch,
        uptime: Math.floor(uptime),
        started,
        memory: {
            rss: `${Math.round(memory.rss / 1024 / 1024)} MB`,
            heapUsed: `${Math.round(memory.heapUsed / 1024 / 1024)} MB`,
            heapTotal: `${Math.round(memory.heapTotal / 1024 / 1024)} MB`,
        },
        hostname,
        version,
    };
}

export function parseJson(value, fallback, onError = () => {}) {
    try {
        return JSON.parse(value);
    } catch (error) {
        onError(error);
        return fallback;
    }
}

export function castConfigValue(previous, next) {
    if (next === undefined) {
        return previous;
    }

    if (typeof previous === 'number' && typeof next === 'number') {
        return next;
    }

    if (typeof previous === 'number' && typeof next === 'string') {
        return Number(next);
    }

    if (typeof previous === 'boolean' && typeof next === 'string') {
        return next === 'true';
    }

    return next;
}

export function mergeConfig(...sources) {
    return sources.reduce(
        (result, source) => {
            for (const [key, value] of Object.entries(source || {})) {
                result[key] = castConfigValue(result[key], value);
            }
            return result;
        },
        {}
    );
}

export function buildMeasuredConfig({
                                        packageJson,
                                        argv,
                                        cwd,
                                        started,
                                    }) {
    return {
        measured: {
            name: packageJson.name,
            version: packageJson.version,
            args: argv,
            cwd,
            started,
        },
    };
}

export function buildLitmdConfig(config, now = new Date()) {
    const hostname = getPrimaryHostname(config);

    return {
        hostname,
        specialPathPrefix: '/',
        baseUrl: getBaseUrl(config),
        author: config.measured.name,
        keywords: 'es6, minimalist, vanillajs, notebook',
        copyrightHolder: config.measured.name,
        copyrightYear: now.getFullYear(),
    };
}

export function buildConfig({
                                defaults = DEFAULT_CONFIG,
                                fileConfig = {},
                                env = {},
                                argv = [],
                                packageJson,
                                cwd,
                                started,
                                now = new Date(),
                                envPrefix = 'SIMP_',
                            }) {
    const envConfig = {};

    for (const key of Object.keys(defaults)) {
        envConfig[key] = env[`${envPrefix}${key.toUpperCase()}`];
    }

    const argConfig =
        argv.length >= 3
            ? parseJson(argv[2], {})
            : {};

    const measured = buildMeasuredConfig({
        packageJson,
        argv,
        cwd,
        started,
    });

    const config = mergeConfig(
        defaults,
        fileConfig,
        envConfig,
        argConfig,
        measured,
    );

    return {
        ...config,
        baseUrl: getBaseUrl(config),
        litmd: buildLitmdConfig(config, now),
    };
}

export function getWatchPaths(config, fallback = '.') {
    if (config.hostnames?.length) {
        const paths = config.hostnames
            .map(host => host.documentRoot)
            .filter(Boolean);

        return paths.length ? paths : [fallback];
    }

    return [config.documentRoot || fallback];
}

export function urlInfoForFile({
                                   filePath,
                                   config,
                                   cwd,
                               }) {
    if (config.hostnames?.length) {
        for (const host of config.hostnames) {
            if (!host.documentRoot) continue;

            const root = path.isAbsolute(host.documentRoot)
                ? host.documentRoot
                : path.join(cwd, host.documentRoot);

            if (filePath.startsWith(root)) {
                const protocol = config.useTls ? 'https' : 'http';
                const port = config.useTls
                    ? config.https
                    : config.http;

                return {
                    baseUrl: `${protocol}://${host.hostname}:${port}`,
                    urlPath: path.relative(root, filePath),
                };
            }
        }
    }

    const root = config.documentRoot || cwd;
    const absoluteRoot = path.isAbsolute(root)
        ? root
        : path.join(cwd, root);

    return {
        baseUrl: config.baseUrl,
        urlPath: path.relative(absoluteRoot, filePath),
    };
}

export function getSocketError(envelope, error) {
    return {
        ...envelope,
        error,
    };
}

/**
 * Pure WebSocket routing decision.
 *
 * Returns an action instead of directly mutating sockets.
 */
export function routeMessage(
    envelope,
    actualFromSocket,
    connections,
) {
    const {
        type,
        from,
        to,
        message,
    } = envelope;

    const fromSocket = connections[from];
    const toSocket = connections[to];

    if (!fromSocket) {
        return {
            type: 'send',
            socket: actualFromSocket,
            message: getSocketError(
                envelope,
                'SOCKET_NOT_REGISTERED'
            ),
        };
    }

    if (fromSocket !== actualFromSocket) {
        return {
            type: 'send',
            socket: actualFromSocket,
            message: getSocketError(
                envelope,
                'MISMATCHED_SOCKET_PUBLIC_KEY'
            ),
        };
    }

    if (message === undefined) {
        return {
            type: 'send',
            socket: actualFromSocket,
            message: getSocketError(
                envelope,
                'MISSING_CONTENT_FIELD'
            ),
        };
    }

    if (type !== 'MESSAGE') {
        return {
            type: 'send',
            socket: actualFromSocket,
            message: getSocketError(
                envelope,
                'MISSING_TYPE_MESSAGE'
            ),
        };
    }

    if (!toSocket) {
        return {
            type: 'send',
            socket: actualFromSocket,
            message: getSocketError(
                message,
                'RECIPIENT_NOT_AVAILABLE'
            ),
        };
    }

    return {
        type: 'deliver',
        recipient: toSocket,
        message,
        confirmation: {
            socket: actualFromSocket,
            message: {
                ...message,
                type: 'MESSAGE_DELIVERED',
            },
        },
    };
}

export function applyRouteAction(action) {
    if (action.type === 'send') {
        action.socket.send(JSON.stringify(action.message));
        return;
    }

    if (action.type === 'deliver') {
        action.recipient.send(action.message);
        action.confirmation.socket.send(
            JSON.stringify(action.confirmation.message)
        );
    }
}
