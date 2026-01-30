#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# DEPLOY-REMOTE.SH - Deploy updates to simpatico server
# =============================================================================
# This script is IDEMPOTENT - safe to run multiple times.
# Run from your local machine: ./ops/deploy-remote.sh [host]
#
# What it does:
#   - SSHs to the server
#   - Pulls latest code
#   - Installs npm dependencies (if changed)
#   - Restarts the service
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_FILE="${SCRIPT_DIR}/provision.conf"

# --- LOAD CONFIGURATION ---
if [[ ! -f "$CONF_FILE" ]]; then
    echo "ERROR: Configuration file not found: $CONF_FILE"
    echo "Copy ops/provision.conf.example to ops/provision.conf and edit it."
    exit 1
fi
# shellcheck source=provision.conf
source "$CONF_FILE"

REPO_DIR="/home/$SERVICE_USER/simpatico"

# --- PARSE ARGS ---
HOST="${1:-$DOMAIN}"

echo "=== Deploying to $HOST ==="

# The script to run on the remote server (runs with sudo)
REMOTE_SCRIPT='
set -euo pipefail

SERVICE_USER="simpatico"
REPO_DIR="/home/$SERVICE_USER/simpatico"

log() { echo "[$(date "+%Y-%m-%d %H:%M:%S")] $*"; }

log "=== Pulling latest code ==="
cd "$REPO_DIR"

# Allow root to access this repo (git security check)
git config --global --add safe.directory "$REPO_DIR" 2>/dev/null || true

# Store current commit
OLD_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "none")

# Fetch first
su - "$SERVICE_USER" -c "cd ~/simpatico && git fetch --all"

# Detect default branch - try main first, fall back to master
if git rev-parse --verify origin/main &>/dev/null; then
    DEFAULT_BRANCH="main"
elif git rev-parse --verify origin/master &>/dev/null; then
    DEFAULT_BRANCH="master"
else
    # Use whatever branch we are currently on
    DEFAULT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
fi
log "Using branch: $DEFAULT_BRANCH"

# Reset to latest
su - "$SERVICE_USER" -c "cd ~/simpatico && git reset --hard origin/$DEFAULT_BRANCH"

NEW_COMMIT=$(git rev-parse HEAD)

if [[ "$OLD_COMMIT" == "$NEW_COMMIT" ]]; then
    log "No changes (still at $OLD_COMMIT)"
else
    log "Updated: $OLD_COMMIT -> $NEW_COMMIT"
fi

# Check if npm install is needed (node_modules missing or package.json changed)
if [[ ! -d "$REPO_DIR/node_modules" ]]; then
    log "=== node_modules missing, running npm install ==="
    su - "$SERVICE_USER" -c "source ~/.nvm/nvm.sh && cd ~/simpatico && npm install"
elif git diff --name-only "$OLD_COMMIT" "$NEW_COMMIT" 2>/dev/null | grep -q "package.json"; then
    log "=== package.json changed, running npm install ==="
    su - "$SERVICE_USER" -c "source ~/.nvm/nvm.sh && cd ~/simpatico && npm install"
else
    log "=== package.json unchanged, skipping npm install ==="
fi

# Restart service if it exists and is enabled
if systemctl is-enabled --quiet simpatico 2>/dev/null; then
    log "=== Restarting simpatico service ==="
    systemctl restart simpatico
    sleep 2
    if systemctl is-active --quiet simpatico; then
        log "Service restarted successfully"
    else
        log "WARNING: Service failed to start!"
        journalctl -u simpatico -n 20 --no-pager
        exit 1
    fi
else
    log "=== Service not enabled, skipping restart ==="
    log "To enable: sudo systemctl enable --now simpatico"
fi

log "=== Deploy complete ==="
'

# Create temp file with the script
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT
echo "$REMOTE_SCRIPT" > "$TMPFILE"

# Copy and execute with sudo
scp -q "$TMPFILE" "$ADMIN_USER@$HOST:/tmp/deploy-script.sh"
ssh "$ADMIN_USER@$HOST" 'sudo bash /tmp/deploy-script.sh; rm -f /tmp/deploy-script.sh'

