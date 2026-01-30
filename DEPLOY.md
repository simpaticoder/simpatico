# Deploying Simpatico

This document describes how to provision a fresh Ubuntu 24 VPS and deploy Simpatico.

## Philosophy

- **Minimalist**: Plain bash scripts, no Ansible/Terraform/etc.
- **Idempotent**: Safe to run multiple times without breaking anything
- **Two scripts**: One for provisioning (once), one for deploying (often)

## Quick Reference

```bash
# Tail logs
sudo journalctl -u simpatico -f

# Service status
sudo systemctl status simpatico

# Restart service
sudo systemctl restart simpatico
```

## Quick Start

```bash
# 1. Create your configuration
cp ops/provision.conf.example ops/provision.conf
# Edit ops/provision.conf with your values (SSH key, domain, etc.)

# 2. Provision a fresh server (run once)
./ops/provision.sh root@your-server-ip

# 3. Deploy updates (run whenever you want to update)
./ops/deploy-remote.sh
```

## Re-running Provisioning

After initial provisioning, root SSH access is disabled. To re-run the script:

```bash
# Use your admin user (runs with sudo automatically)
./ops/provision.sh josh@your-server-ip
```

The script detects whether you're connecting as root or a regular user and uses `sudo` accordingly.

## Configuration

Copy `ops/provision.conf.example` to `ops/provision.conf` and edit:

```bash
HOSTNAME="simpatico"           # Server hostname
DOMAIN="simpatico.io"          # Your domain
TIMEZONE="America/Los_Angeles" # Server timezone

ADMIN_USER="josh"              # Your admin username
ADMIN_SSH_PUBKEY="ssh-ed25519 AAAA..."  # Your public SSH key

SERVICE_USER="simpatico"       # User that runs the app
SERVICE_REPO="https://github.com/javajosh/simpatico.git"
NODE_VERSION="22"
```

**Important**: `ops/provision.conf` is gitignored - never commit it.

## Provisioning (One-Time Setup)

The `provision.sh` script sets up a fresh Ubuntu 24 VPS:

```bash
./ops/provision.sh root@your-server-ip
```

### What it does:

| Step | Description | Idempotency |
|------|-------------|-------------|
| System | Sets hostname, timezone, updates packages | Checks before changing |
| Admin user | Creates user with sudo + SSH key | Skips if user exists |
| Service user | Creates unprivileged user for app | Skips if user exists |
| SSH hardening | Disables root login, password auth | Checks config first |
| Firewall | UFW with ports 22, 80, 443 | UFW handles duplicates |
| Fail2ban | Blocks brute-force attempts | Skips if installed |
| Auto-updates | Unattended security upgrades | Skips if configured |
| Node.js | Installs via nvm for service user | Skips if installed |
| Certbot | Let's Encrypt certificate tool | Skips if installed |
| Repository | Clones the repo | Skips if exists |
| Systemd | Creates service file | Skips if exists |

### After provisioning:

```bash
# SSH in as your admin user
ssh josh@simpatico.io

# Get SSL certificate (interactive - requires DNS to be set up)
sudo certbot certonly --standalone -d simpatico.io

# Enable and start the service
sudo systemctl enable --now simpatico

# Check status
sudo systemctl status simpatico

# View logs
sudo journalctl -u simpatico -f
```

## Deploying Updates

The `deploy-remote.sh` script updates the server:

```bash
./ops/deploy-remote.sh              # Uses domain from provision.conf
./ops/deploy-remote.sh other.host   # Deploy to a different host
```

### What it does:

1. SSHs to the server as admin user
2. Pulls latest code from `origin/main`
3. Runs `npm install` only if `package.json` changed
4. Restarts the systemd service
5. Shows logs if restart fails

## Upgrading Node.js

The `upgrade-node.sh` script safely upgrades Node.js with automatic rollback:

```bash
./ops/upgrade-node.sh          # Upgrade to latest in configured major (e.g., 22.x)
./ops/upgrade-node.sh 22       # Upgrade to latest Node 22.x
./ops/upgrade-node.sh 24       # Upgrade to Node 24.x
```

### What it does:

1. Installs new Node version (keeps old versions for rollback)
2. Tests the new binary
3. Updates `/usr/local/bin/node` symlink
4. Restarts the service
5. **Automatically rolls back** if service fails to start

### Why symlinks?

Simpatico binds to privileged ports (80, 443), so it must start as root. The systemd service uses `/usr/local/bin/node` which is a symlink to the actual nvm-managed binary. This:

- Avoids fragile glob patterns in systemd
- Survives minor version upgrades
- Provides a stable path for root to execute

### Manual rollback

If you need to rollback manually:
```bash
ssh josh@simpatico.io
# List available versions
sudo -u simpatico bash -c 'source ~/.nvm/nvm.sh && nvm ls'
# Point to old version
sudo ln -sf /home/simpatico/.nvm/versions/node/v22.1.0/bin/node /usr/local/bin/node
sudo systemctl restart simpatico
```

## Manual Operations

### Restart the service
```bash
ssh josh@simpatico.io 'sudo systemctl restart simpatico'
```

### View logs
```bash
ssh josh@simpatico.io 'sudo journalctl -u simpatico -f'
```

### Renew SSL certificate
```bash
ssh josh@simpatico.io 'sudo certbot renew'
```

### Check certificate expiry
```bash
ssh josh@simpatico.io 'sudo certbot certificates'
```

## Troubleshooting

### Service won't start
```bash
# Check logs
sudo journalctl -u simpatico -n 50

# Check if node is accessible
sudo -u simpatico bash -c 'source ~/.nvm/nvm.sh && node --version'

# Check if certs exist
ls -la /etc/letsencrypt/live/simpatico.io/
```

### Can't SSH after provisioning
The script disables root login. Make sure:
1. Your SSH public key is correct in `provision.conf`
2. You're using the admin username, not root

### Firewall blocking traffic
```bash
sudo ufw status
sudo ufw allow 80
sudo ufw allow 443
```

## File Structure

```
ops/
├── provision.conf.example  # Template - copy and edit
├── provision.conf          # Your config (gitignored)
├── provision.sh            # One-time server setup
├── deploy-remote.sh        # Recurring deployments
└── upgrade-node.sh         # Safe Node.js upgrades
```

