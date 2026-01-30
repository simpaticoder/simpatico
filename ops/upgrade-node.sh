#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# UPGRADE-NODE.SH - Safely upgrade Node.js on the server
# =============================================================================
# This script upgrades Node.js with rollback capability.
# Run from your local machine: ./ops/upgrade-node.sh [version]
#
# Examples:
#   ./ops/upgrade-node.sh          # Upgrade to latest in current major (e.g., 22.x)
#   ./ops/upgrade-node.sh 22       # Upgrade to latest Node 22.x
#   ./ops/upgrade-node.sh 24       # Upgrade to Node 24.x
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_FILE="${SCRIPT_DIR}/provision.conf"

# --- LOAD CONFIGURATION ---
if [[ ! -f "$CONF_FILE" ]]; then
    echo "ERROR: Configuration file not found: $CONF_FILE"
    exit 1
fi
source "$CONF_FILE"

NEW_VERSION="${1:-$NODE_VERSION}"
HOST="${2:-$DOMAIN}"

echo "=== Upgrading Node.js to $NEW_VERSION on $HOST ==="

# Script runs as root on the server
REMOTE_SCRIPT='
set -euo pipefail

SERVICE_USER="simpatico"
NEW_VERSION="'"$NEW_VERSION"'"

log() { echo "[$(date "+%Y-%m-%d %H:%M:%S")] $*"; }

# Get current version
CURRENT_NODE=$(readlink -f /usr/local/bin/node 2>/dev/null || echo "none")
log "Current node: $CURRENT_NODE"

# Install new version (keeps old versions)
log "Installing Node.js $NEW_VERSION..."
su - "$SERVICE_USER" -c "source ~/.nvm/nvm.sh && nvm install $NEW_VERSION"

# Get path to new version
NEW_NODE=$(su - "$SERVICE_USER" -c "source ~/.nvm/nvm.sh && nvm which $NEW_VERSION")
log "New node binary: $NEW_NODE"

# Verify new version works
log "Testing new Node.js..."
su - "$SERVICE_USER" -c "$NEW_NODE --version"

# Update symlink
log "Updating /usr/local/bin/node symlink..."
ln -sf "$NEW_NODE" /usr/local/bin/node

# Verify symlink
log "Symlink now points to: $(readlink -f /usr/local/bin/node)"
log "Node version: $(/usr/local/bin/node --version)"

# Restart service
if systemctl is-enabled --quiet simpatico 2>/dev/null; then
    log "Restarting simpatico service..."
    systemctl restart simpatico
    sleep 2
    if systemctl is-active --quiet simpatico; then
        log "Service restarted successfully"
        log ""
        log "=== Upgrade complete! ==="
        log "Old: $CURRENT_NODE"
        log "New: $NEW_NODE"
        log ""
        log "To rollback if needed:"
        log "  sudo ln -sf $CURRENT_NODE /usr/local/bin/node"
        log "  sudo systemctl restart simpatico"
    else
        log "ERROR: Service failed to start! Rolling back..."
        ln -sf "$CURRENT_NODE" /usr/local/bin/node
        systemctl restart simpatico
        log "Rolled back to $CURRENT_NODE"
        exit 1
    fi
else
    log "Service not enabled, skipping restart"
fi
'

# Create temp file with the script
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT
echo "$REMOTE_SCRIPT" > "$TMPFILE"

# Copy and execute with sudo
scp -q "$TMPFILE" "$ADMIN_USER@$HOST:/tmp/upgrade-node-script.sh"
ssh "$ADMIN_USER@$HOST" 'sudo bash /tmp/upgrade-node-script.sh; rm -f /tmp/upgrade-node-script.sh'

