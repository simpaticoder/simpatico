# Operations

Scripts and docs for deploying and operating simpatico in production.

All shell scripts are **idempotent** — safe to run multiple times.

## Scripts

| Script | Purpose |
|--------|---------|
| `provision.sh` | One-time Ubuntu 24 VPS setup. Creates users, hardens SSH, installs Node.js and certbot, and configures systemd. |
| `deploy-remote.sh` | Deploys code updates. Pulls latest, runs `npm install` if needed, restarts the service. |
| `sync-config.sh` | Copies `server.config.json` to the remote server. |
| `upgrade-node.sh` | Upgrades Node.js with automatic rollback if the service fails to start. |

## Configuration

- **`provision.conf.example`** — Template for `provision.conf`. Copy and edit with your values. Do not commit the real `provision.conf`.
- **`server.config.json.example`** — Template for the reflector runtime config. Copy to `server.config.json` and edit.

## Docs

- **`certbot.md`** — Let's Encrypt certificate setup and renewal.
- **`systemd.md`** — Managing the simpatico systemd service.
- **`nginx.md`** — Stopping/disabling nginx (if pre-installed on the VPS).
- **`tmux.md`** — tmux quick reference.
- **`zellij.md`** — Zellij keybindings.
- **`git.md`** — Git line endings and identity setup.
