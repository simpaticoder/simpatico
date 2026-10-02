#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# FIX-CERTS.SH - Switch certbot from standalone to webroot, then test
# =============================================================================
# Run from your local machine: ./ops/fix-certs.sh [host]
#
# This temporarily stops simpatico, edits the certbot renewal configs to use
# webroot authentication, runs a dry-run test, then restarts simpatico.
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_FILE="${SCRIPT_DIR}/provision.conf"

if [[ ! -f "$CONF_FILE" ]]; then
    echo "ERROR: Configuration file not found: $CONF_FILE"
    exit 1
fi
source "$CONF_FILE"

HOST="${1:-$DOMAIN}"
WEBROOT="/home/${SERVICE_USER}/simpatico"

echo "=== Fixing certbot certs on $HOST ==="
echo "Webroot: $WEBROOT"
echo ""

REMOTE_SCRIPT="
set -euo pipefail

SERVICE_USER='${SERVICE_USER}'
WEBROOT='${WEBROOT}'

log() { echo \"[\$(date '+%Y-%m-%d %H:%M:%S')] \$*\"; }

log '=== Stopping simpatico ==='
systemctl stop simpatico || true

log '=== Patching renewal configs ==='
for conf in /etc/letsencrypt/renewal/*.conf; do
    if [[ ! -f \"\$conf\" ]]; then
        log 'No renewal configs found'
        break
    fi
    log \"Patching: \$conf\"
    # Replace standalone with webroot
    sed -i 's/^authenticator\s*=\s*standalone/authenticator = webroot/' \"\$conf\"
    # Ensure webroot_path is set (remove old one first, then add)
    sed -i '/^webroot_path/d' \"\$conf\"
    sed -i '/^\[renewalparams\]/a webroot_path = '"\$WEBROOT\" \"\$conf\"
done

log '=== Listing patched configs ==='
grep -H '^authenticator\|^webroot_path' /etc/letsencrypt/renewal/*.conf || true
echo ''

log '=== Running certbot dry-run ==='
if certbot renew --dry-run --webroot --webroot-path \"\$WEBROOT\"; then
    log 'Dry-run succeeded'
else
    log 'WARNING: Dry-run failed — check output above'
fi

log '=== Restarting simpatico ==='
systemctl start simpatico
sleep 2
if systemctl is-active --quiet simpatico; then
    log 'Simpatico restarted successfully'
else
    log 'ERROR: Simpatico failed to start'
    journalctl -u simpatico -n 10 --no-pager
    exit 1
fi

log '=== Done ==='
"

TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT
echo "$REMOTE_SCRIPT" > "$TMPFILE"

scp -q "$TMPFILE" "$ADMIN_USER@$HOST:/tmp/fix-certs.sh"
ssh "$ADMIN_USER@$HOST" 'sudo bash /tmp/fix-certs.sh; rm -f /tmp/fix-certs.sh'
