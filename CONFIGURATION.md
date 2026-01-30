# Server Configuration Guide

This guide explains how to configure the Simpatico server with file-based configuration, multiple hostnames, and Let's Encrypt support.

## Configuration Methods

The server supports multiple configuration methods with the following priority (highest to lowest):

1. **Command-line arguments** (JSON string)
2. **Environment variables** (prefixed with `SIMP_`)
3. **Configuration file** (JSON file, default: `./server.config.json`)
4. **Default values**

## File-Based Configuration

### Basic Usage (Single Hostname)

Create a `server.config.json` file in your project root:

```json
{
  "http": 8080,
  "https": 8443,
  "hostname": "localhost",
  "useTls": false,
  "enableWebsockets": true,
  "useCache": true,
  "useGzip": true,
  "logFileServerRequests": true,
  "superCacheEnabled": false,
  "debug": false,
  "httpKeepAlive": 100,
  "httpHeadersTimeout": 100
}
```

Then start the server:

```bash
node server.js
```

### Custom Configuration File

Use a different configuration file:

```bash
SIMP_CONFIGFILE=./my-config.json node server.js
```

Or via command-line:

```bash
node server.js '{"configFile": "./my-config.json"}'
```

## Multi-Hostname Support with Let's Encrypt

The server supports multiple hostnames with individual TLS certificates using SNI (Server Name Indication). Each hostname can serve files from a different directory.

### Configuration Example

See `server.config.example.json` for a complete example. Create `server.config.json`:

```json
{
  "http": 80,
  "https": 443,
  "useTls": true,
  "enableWebsockets": true,
  "runAsUser": "www-data",
  "hostnames": [
    {
      "hostname": "example.com",
      "cert": "/etc/letsencrypt/live/example.com/fullchain.pem",
      "key": "/etc/letsencrypt/live/example.com/privkey.pem",
      "documentRoot": "/var/www/example.com"
    },
    {
      "hostname": "www.example.com",
      "cert": "/etc/letsencrypt/live/www.example.com/fullchain.pem",
      "key": "/etc/letsencrypt/live/www.example.com/privkey.pem",
      "documentRoot": "/var/www/example.com"
    },
    {
      "hostname": "api.example.com",
      "cert": "/etc/letsencrypt/live/api.example.com/fullchain.pem",
      "key": "/etc/letsencrypt/live/api.example.com/privkey.pem",
      "documentRoot": "/var/www/api.example.com"
    }
  ]
}
```

**Note:** Each hostname can serve files from a different directory using the `documentRoot` option. If not specified, the current working directory is used.

### Let's Encrypt Setup

1. **Install Certbot**:
   ```bash
   sudo apt-get update
   sudo apt-get install certbot
   ```

2. **Generate certificates for each hostname**:
   ```bash
   sudo certbot certonly --standalone -d example.com
   sudo certbot certonly --standalone -d www.example.com
   sudo certbot certonly --standalone -d api.example.com
   ```

3. **Start the server with sudo** (for privileged ports):
   ```bash
   sudo node server.js
   ```

### Automatic Certificate Reload

The server automatically watches all certificate files and reloads them when they change. This is perfect for Let's Encrypt auto-renewal:

- Certificates are monitored using `chokidar`
- When a certificate file changes, it's automatically reloaded
- No server restart required
- All hostnames are reloaded simultaneously

### ACME Challenge Support

The server automatically handles Let's Encrypt ACME challenges on HTTP (port 80):

- Requests to `/.well-known/acme-challenge/*` are served from the filesystem
- Works for all configured hostnames
- Validates token format for security
- Other HTTP requests are redirected to HTTPS

## Configuration Options

| Option | Type    | Default                 | Description                                         |
|--------|---------|-------------------------|-----------------------------------------------------|
| `http` | number  | 8080                    | HTTP port                                           |
| `https` | number  | 8443                    | HTTPS port                                          |
| `hostname` | string  | 'localhost'             | Primary hostname (used when `hostnames` is not set) |
| `cert` | string  | './fullchain.pem'       | TLS certificate path (single hostname mode)         |
| `key` | string  | './privkey.pem'         | TLS private key path (single hostname mode)         |
| `useTls` | boolean | false                   | Enable HTTPS                                        |
| `enableWebsockets` | boolean | true                    | Enable WebSocket support                            |
| `useCache` | boolean | true                    | Enable in-memory caching                            |
| `useGzip` | boolean | true                    | Enable gzip compression                             |
| `logFileServerRequests` | boolean | true                    | Log HTTP requests                                   |
| `superCacheEnabled` | boolean | false                   | Enable aggressive caching                           |
| `debug` | boolean | false                   | Enable debug logging                                |
| `runAsUser` | string  | ''                      | Drop privileges to this user after binding          |
| `configFile` | string  | './server.config.json'  | Path to configuration file                          |
| `hostnames` | array   | null                    | Multi-hostname configuration (see below)            |

### Hostnames Array Format

Each hostname entry requires:

```json
{
  "hostname": "example.com",
  "cert": "/path/to/fullchain.pem",
  "key": "/path/to/privkey.pem"
}
```

## Examples

### Development (HTTP only)

```json
{
  "http": 8080,
  "useTls": false,
  "debug": true
}
```

### Production (Single hostname with Let's Encrypt)

```json
{
  "http": 80,
  "https": 443,
  "useTls": true,
  "hostname": "example.com",
  "cert": "/etc/letsencrypt/live/example.com/fullchain.pem",
  "key": "/etc/letsencrypt/live/example.com/privkey.pem",
  "runAsUser": "www-data"
}
```

### Production (Multiple hostnames with Let's Encrypt)

```json
{
  "http": 80,
  "https": 443,
  "useTls": true,
  "runAsUser": "www-data",
  "hostnames": [
    {
      "hostname": "example.com",
      "cert": "/etc/letsencrypt/live/example.com/fullchain.pem",
      "key": "/etc/letsencrypt/live/example.com/privkey.pem"
    },
    {
      "hostname": "www.example.com",
      "cert": "/etc/letsencrypt/live/www.example.com/fullchain.pem",
      "key": "/etc/letsencrypt/live/www.example.com/privkey.pem"
    }
  ]
}
```

### Local Development with Self-Signed Certificates

```json
{
  "http": 8080,
  "https": 8443,
  "useTls": true,
  "hostnames": [
    {
      "hostname": "localhost",
      "cert": "./simpatico.localhost.crt.pem",
      "key": "./simpatico.localhost.key.pem",
      "documentRoot": "/home/user/projects/site1"
    },
    {
      "hostname": "dev.localhost",
      "cert": "./dev.localhost.crt.pem",
      "key": "./dev.localhost.key.pem",
      "documentRoot": "/home/user/projects/site2"
    }
  ]
}
```

## Document Root Configuration

### Single-Hostname Mode

In single-hostname mode, you can specify a custom document root:

```json
{
  "http": 8080,
  "documentRoot": "/var/www/mysite"
}
```

If not specified, the current working directory (`process.cwd()`) is used.

### Multi-Hostname Mode

Each hostname can serve files from a different directory:

```json
{
  "hostnames": [
    {
      "hostname": "blog.example.com",
      "documentRoot": "/var/www/blog"
    },
    {
      "hostname": "shop.example.com",
      "documentRoot": "/var/www/shop"
    }
  ]
}
```

This allows you to host multiple completely separate websites on the same server, each with their own files and TLS certificates.

### Custom Templates per Hostname

Each hostname can have its own header, footer, and default imports for literate markdown files. This uses **convention over configuration**:

1. If `{documentRoot}/lib/litmd-header.html` exists, it will be used instead of simpatico's default header
2. If `{documentRoot}/lib/litmd-footer.html` exists, it will be used instead of simpatico's default footer
3. If `{documentRoot}/lib/litmd-imports.js` exists, it will be used instead of simpatico's default imports

**Example directory structure for a custom site:**

```
/var/www/joshrehman.com/
├── lib/
│   ├── litmd-header.html    # Custom header (optional)
│   ├── litmd-footer.html    # Custom footer (optional)
│   └── litmd-imports.js     # Custom JS imports (optional)
├── vendor/                   # Front-end libraries
│   ├── highlight.min.js
│   └── github-markdown.css
├── img/
│   └── logo.svg
├── index.md
└── about.md
```

Each template file is checked independently, so you can override just the header while using simpatico's default footer.

The templates support the same `{{placeholder}}` variables as simpatico's defaults:
- `{{title}}` - Page title
- `{{hostname}}` - Current hostname
- `{{baseUrl}}` - Full base URL (e.g., `https://example.com`)
- `{{specialPathPrefix}}` - Path prefix for resources (default: `/`)
- `{{author}}` - Author name
- `{{keywords}}` - Meta keywords
- `{{copyrightHolder}}` - Copyright holder name
- `{{copyrightYear}}` - Current year

## Environment Variables

All configuration options can be set via environment variables with the `SIMP_` prefix:

```bash
SIMP_HTTP=8080 SIMP_HTTPS=8443 SIMP_USETLS=true node server.js
```

## Command-Line Arguments

Override any configuration with a JSON string:

```bash
node server.js '{"http": 3000, "debug": true}'
```

## Certificate Renewal with Let's Encrypt

### Automatic Renewal

Let's Encrypt certificates expire after 90 days. Set up automatic renewal:

1. **Test renewal**:
   ```bash
   sudo certbot renew --dry-run
   ```

2. **Set up cron job** (runs twice daily):
   ```bash
   sudo crontab -e
   ```

   Add:
   ```
   0 0,12 * * * certbot renew --quiet --post-hook "echo 'Certificates renewed'"
   ```

3. **The server automatically reloads certificates** when they change - no restart needed!

### Manual Renewal

```bash
sudo certbot renew
```

The server will detect the certificate change and reload automatically.

## Security Notes

1. **Privileged Ports**: Binding to ports 80 and 443 requires root/sudo. Use `runAsUser` to drop privileges after binding.

2. **File Permissions**: Ensure certificate files are readable by the user the server runs as:
   ```bash
   sudo chmod 644 /etc/letsencrypt/live/*/fullchain.pem
   sudo chmod 600 /etc/letsencrypt/live/*/privkey.pem
   ```

3. **ACME Challenges**: The server validates ACME token format to prevent directory traversal attacks.

## Troubleshooting

### Port Already in Use

```bash
# Find process using port 8080
sudo lsof -i :8080

# Kill the process
sudo kill -9 <PID>
```

### Certificate Errors

Check certificate files exist and are readable:
```bash
sudo ls -la /etc/letsencrypt/live/example.com/
```

### Debug Mode

Enable debug logging to see detailed information:
```json
{
  "debug": true
}
```

## Configuration Options Reference

### Core Server Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `http` | number | `8080` | HTTP port number |
| `https` | number | `8443` | HTTPS port number |
| `hostname` | string | `'localhost'` | Default hostname (used in single-hostname mode) |
| `useTls` | boolean | `false` | Enable HTTPS/TLS |
| `cert` | string | `'./fullchain.pem'` | Path to TLS certificate (single-hostname mode) |
| `key` | string | `'./privkey.pem'` | Path to TLS private key (single-hostname mode) |
| `documentRoot` | string | `process.cwd()` | Document root directory for serving files (single-hostname mode) |
| `runAsUser` | string | `''` | Drop privileges to this user after binding to ports |

### Multi-Hostname Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `hostnames` | array | `null` | Array of hostname configurations (see below) |

Each hostname object in the `hostnames` array:
```json
{
  "hostname": "example.com",
  "cert": "/path/to/fullchain.pem",
  "key": "/path/to/privkey.pem",
  "documentRoot": "/var/www/example.com"
}
```

**Note:** The `documentRoot` field is optional. If not specified, the current working directory is used.

### Feature Flags

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableWebsockets` | boolean | `true` | Enable WebSocket server |
| `useCache` | boolean | `true` | Enable in-memory file caching |
| `useGzip` | boolean | `true` | Enable gzip compression |
| `superCacheEnabled` | boolean | `false` | Enable super cache mode |
| `logFileServerRequests` | boolean | `true` | Log all file server requests |
| `debug` | boolean | `false` | Enable debug logging |

### HTTP Server Tuning

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `httpKeepAlive` | number | `100` | HTTP keep-alive timeout in milliseconds |
| `httpHeadersTimeout` | number | `100` | HTTP headers timeout in milliseconds |

### Other Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `configFile` | string | `'./server.config.json'` | Path to configuration file |

## Security Features

### WebSocket Server Seed
The WebSocket server uses a cryptographically secure random seed generated on each startup using Node.js's `crypto.randomBytes()`. This ensures each server instance has a unique, unpredictable seed for secure WebSocket connections.

### ACME Challenge Validation
The server validates ACME token format to prevent directory traversal attacks when serving Let's Encrypt challenges.

### Privilege Dropping
Use the `runAsUser` option to drop privileges after binding to privileged ports (80, 443):
```json
{
  "http": 80,
  "https": 443,
  "runAsUser": "www-data"
}
```
