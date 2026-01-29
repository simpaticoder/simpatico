# Server Configuration Guide

This guide explains how to configure the Simpatico server with file-based configuration, multiple hostnames, and Let's Encrypt support.

## Configuration Methods

The server supports multiple configuration methods with the following priority (highest to lowest):

1. **Command-line arguments** (JSON string)
2. **Environment variables** (prefixed with `SIMP_`)
3. **Configuration file** (JSON file, default: `./server.config.json`)
4. **Default values**

## File-Based Configuration

### Basic Usage

Create a `server.config.json` file in your project root:

```json
{
  "http": 8080,
  "https": 8443,
  "useTls": false,
  "enableWebsockets": true,
  "useCache": true,
  "useGzip": true,
  "logFileServerRequests": true,
  "debug": false
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

The server supports multiple hostnames with individual TLS certificates using SNI (Server Name Indication).

### Configuration Example

Create `server.config.json`:

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
      "key": "/etc/letsencrypt/live/example.com/privkey.pem"
    },
    {
      "hostname": "www.example.com",
      "cert": "/etc/letsencrypt/live/www.example.com/fullchain.pem",
      "key": "/etc/letsencrypt/live/www.example.com/privkey.pem"
    },
    {
      "hostname": "api.example.com",
      "cert": "/etc/letsencrypt/live/api.example.com/fullchain.pem",
      "key": "/etc/letsencrypt/live/api.example.com/privkey.pem"
    }
  ]
}
```

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
      "key": "./simpatico.localhost.key.pem"
    },
    {
      "hostname": "dev.localhost",
      "cert": "./dev.localhost.crt.pem",
      "key": "./dev.localhost.key.pem"
    }
  ]
}
```

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

## Migration from Command-Line Configuration

**Before** (command-line):
```bash
node server.js '{"hostname": "example.com", "useTls": true, "cert": "./cert.pem", "key": "./key.pem"}'
```

**After** (config file):

Create `server.config.json`:
```json
{
  "hostname": "example.com",
  "useTls": true,
  "cert": "./cert.pem",
  "key": "./key.pem"
}
```

Then run:
```bash
node server.js
```

## No New Dependencies

All features use only Node.js built-in modules:
- `node:fs` - File system operations
- `node:http` / `node:https` - HTTP/HTTPS servers
- `node:tls` - TLS/SSL support for SNI
- `node:crypto` - Hashing and security

Existing dependencies (already in package.json):
- `chokidar` - File watching for certificate reload
- `ws` - WebSocket support
