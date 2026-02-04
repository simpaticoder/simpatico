#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# SYNC-CONFIG.SH - Sync server.config.json to remote server
# =============================================================================
# This script copies your local ops/server.config.json to the remote server.
#
# Usage:
#   ./ops/sync-config.sh [host]
#
# Setup:
#   1. Copy ops/server.config.json.example to ops/server.config.json
#   2. Edit ops/server.config.json with your production settings
#   3. Run this script to deploy the config
#
# The config file is copied to /home/$SERVICE_USER/simpatico/server.config.json
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_FILE="${SCRIPT_DIR}/provision.conf"
CONFIG_FILE="${SCRIPT_DIR}/server.config.json"

# --- LOAD CONFIGURATION ---
if [[ ! -f "$CONF_FILE" ]]; then
    echo "ERROR: Configuration file not found: $CONF_FILE"
    echo "Copy ops/provision.conf.example to ops/provision.conf and edit it."
    exit 1
fi
# shellcheck source=provision.conf
source "$CONF_FILE"

# --- CHECK SERVER CONFIG EXISTS ---
if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "ERROR: Server config not found: $CONFIG_FILE"
    echo ""
    echo "To create it:"
    echo "  cp ops/server.config.json.example ops/server.config.json"
    echo "  # Edit ops/server.config.json with your production settings"
    exit 1
fi

# --- VALIDATE JSON ---
if ! python3 -m json.tool "$CONFIG_FILE" > /dev/null 2>&1; then
    echo "ERROR: Invalid JSON in $CONFIG_FILE"
    echo ""
    echo "Validation error:"
    python3 -m json.tool "$CONFIG_FILE"
    exit 1
fi

# --- PARSE ARGS ---
HOST="${1:-$DOMAIN}"
REMOTE_PATH="/home/$SERVICE_USER/simpatico/server.config.json"

echo "=== Syncing server config to $HOST ==="
echo "Local:  $CONFIG_FILE"
echo "Remote: $REMOTE_PATH"
echo ""

# --- COPY CONFIG ---
# Copy to temp location first, then move with sudo (in case of permission issues)
REMOTE_TMP="/tmp/server.config.json.$$"

scp -q "$CONFIG_FILE" "$ADMIN_USER@$HOST:$REMOTE_TMP"

ssh "$ADMIN_USER@$HOST" "
    sudo mv '$REMOTE_TMP' '$REMOTE_PATH'
    sudo chown $SERVICE_USER:$SERVICE_USER '$REMOTE_PATH'
    sudo chmod 644 '$REMOTE_PATH'
    echo 'Config installed successfully'
    echo ''
    echo 'To apply changes, restart the service:'
    echo '  sudo systemctl restart simpatico'
"

echo ""
echo "=== Config sync complete ==="

