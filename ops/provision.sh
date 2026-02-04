#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# PROVISION.SH - One-time server provisioning for Ubuntu 24 VPS
# =============================================================================
# This script is IDEMPOTENT - safe to run multiple times.
#
# Usage:
#   1. Copy ops/provision.conf.example to ops/provision.conf
#   2. Edit ops/provision.conf with your values
#   3. Run: ./ops/provision.sh root@your-server
#
# What it does (once):
#   - Creates admin user with SSH key access and sudo
#   - Creates service user for running simpatico
#   - Hardens SSH (disables root login, password auth)
#   - Configures UFW firewall (22, 80, 443)
#   - Installs fail2ban, enables automatic security updates
#   - Installs Node.js via nvm, certbot for Let's Encrypt
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONF_FILE="${SCRIPT_DIR}/provision.conf"

# --- If run with an SSH target, execute remotely ---
if [[ $# -ge 1 && "$1" == *@* ]]; then
    SSH_TARGET="$1"
    if [[ ! -f "$CONF_FILE" ]]; then
        echo "ERROR: Configuration file not found: $CONF_FILE"
        echo "Copy ops/provision.conf.example to ops/provision.conf and edit it."
        exit 1
    fi
    echo "=== Provisioning $SSH_TARGET ==="

    # Create a combined script with config + provisioning code
    TMPFILE=$(mktemp)
    trap "rm -f $TMPFILE" EXIT
    {
        echo '#!/usr/bin/env bash'
        echo 'set -euo pipefail'
        cat "$CONF_FILE"
        sed -n '/^# --- REMOTE SCRIPT START ---$/,$p' "$0"
    } > "$TMPFILE"

    # Copy and execute
    scp -q "$TMPFILE" "$SSH_TARGET:/tmp/provision-script.sh"
    if [[ "$SSH_TARGET" == root@* ]]; then
        ssh "$SSH_TARGET" 'bash /tmp/provision-script.sh; rm -f /tmp/provision-script.sh'
    else
        ssh "$SSH_TARGET" 'sudo bash /tmp/provision-script.sh; rm -f /tmp/provision-script.sh'
    fi
    exit $?
fi

# --- REMOTE SCRIPT START ---
# Validate required variables
for var in HOSTNAME DOMAIN ADMIN_USER ADMIN_SSH_PUBKEY SERVICE_USER SERVICE_REPO NODE_VERSION TIMEZONE; do
    if [[ -z "${!var:-}" ]]; then
        echo "ERROR: Required variable $var is not set"
        echo "Run this script with: ./ops/provision.sh root@your-server"
        exit 1
    fi
done

# --- HELPERS ---
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
log_skip() { log "SKIP: $* (already done)"; }
log_do() { log "DO: $*"; }
user_exists() { id "$1" &>/dev/null; }
package_installed() { dpkg -l "$1" 2>/dev/null | grep -q "^ii"; }
file_contains() { grep -qF "$2" "$1" 2>/dev/null; }

# --- SYSTEM BASICS ---
provision_system() {
    log "=== System basics ==="
    if [[ "$(timedatectl show --property=Timezone --value)" != "$TIMEZONE" ]]; then
        log_do "Setting timezone to $TIMEZONE"; timedatectl set-timezone "$TIMEZONE"
    else log_skip "Timezone already $TIMEZONE"; fi
    if [[ "$(hostname)" != "$HOSTNAME" ]]; then
        log_do "Setting hostname to $HOSTNAME"; hostnamectl set-hostname "$HOSTNAME"
    else log_skip "Hostname already $HOSTNAME"; fi
    log_do "Updating package lists"; apt-get update -qq
    log_do "Upgrading packages"; DEBIAN_FRONTEND=noninteractive apt-get upgrade -y -qq
}

# --- USERS ---
provision_users() {
    log "=== Users ==="
    # Admin user
    if user_exists "$ADMIN_USER"; then log_skip "Admin user $ADMIN_USER exists"
    else log_do "Creating admin user $ADMIN_USER"
        adduser --gecos "" --disabled-password "$ADMIN_USER"; usermod -aG sudo "$ADMIN_USER"
    fi
    # Admin SSH key
    local admin_ssh_dir="/home/$ADMIN_USER/.ssh" admin_auth_keys="/home/$ADMIN_USER/.ssh/authorized_keys"
    mkdir -p "$admin_ssh_dir"
    if file_contains "$admin_auth_keys" "$ADMIN_SSH_PUBKEY"; then log_skip "Admin SSH key already installed"
    else log_do "Installing admin SSH key"; echo "$ADMIN_SSH_PUBKEY" >> "$admin_auth_keys"; fi
    chmod 700 "$admin_ssh_dir"; chmod 600 "$admin_auth_keys"; chown -R "$ADMIN_USER:$ADMIN_USER" "$admin_ssh_dir"
    # Passwordless sudo
    local sudoers_file="/etc/sudoers.d/$ADMIN_USER"
    if [[ -f "$sudoers_file" ]]; then log_skip "Passwordless sudo already configured"
    else log_do "Enabling passwordless sudo"; echo "$ADMIN_USER ALL=(ALL) NOPASSWD: ALL" > "$sudoers_file"; chmod 440 "$sudoers_file"; fi
    # Service user
    if user_exists "$SERVICE_USER"; then log_skip "Service user $SERVICE_USER exists"
    else log_do "Creating service user $SERVICE_USER"; adduser --gecos "" --disabled-password --shell /bin/bash "$SERVICE_USER"; fi
    # GitHub known_hosts
    local service_ssh_dir="/home/$SERVICE_USER/.ssh" known_hosts="/home/$SERVICE_USER/.ssh/known_hosts"
    mkdir -p "$service_ssh_dir"
    if file_contains "$known_hosts" "github.com"; then log_skip "GitHub known_hosts already configured"
    else log_do "Adding GitHub to known_hosts"
        cat <<'EOF' > "$known_hosts"
github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl
github.com ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBEmKSENjQEezOmxkZMy7opKgwFB9nkt5YRrYMjNuG5N87uRgg6CLrbo5wAdT/y6v0mKV0U2w0WZ2YB/++Tpockg=
EOF
    fi
    chmod 700 "$service_ssh_dir"; chmod 644 "$known_hosts"; chown -R "$SERVICE_USER:$SERVICE_USER" "$service_ssh_dir"
}

# --- SSH HARDENING ---
provision_ssh() {
    log "=== SSH hardening ==="; local sshd_config="/etc/ssh/sshd_config" changed=false
    if grep -qE "^PermitRootLogin no" "$sshd_config"; then log_skip "Root login already disabled"
    else log_do "Disabling root login"; sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/' "$sshd_config"; changed=true; fi
    if grep -qE "^PasswordAuthentication no" "$sshd_config"; then log_skip "Password auth already disabled"
    else log_do "Disabling password authentication"; sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' "$sshd_config"; changed=true; fi
    if $changed; then log_do "Restarting SSH"; systemctl restart ssh; fi
}

# --- FIREWALL ---
provision_firewall() {
    log "=== Firewall (UFW) ==="
    if ! package_installed ufw; then log_do "Installing UFW"; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw
    else log_skip "UFW already installed"; fi
    ufw default deny incoming >/dev/null 2>&1; ufw default allow outgoing >/dev/null 2>&1
    for port in 22 80 443; do
        if ufw status | grep -qw "$port"; then log_skip "Port $port already allowed"
        else log_do "Allowing port $port"; ufw allow "$port" >/dev/null; fi
    done
    if ufw status | grep -q "Status: active"; then log_skip "UFW already active"
    else log_do "Enabling UFW"; echo "y" | ufw enable >/dev/null; fi
    ufw logging off >/dev/null 2>&1
}

# --- FAIL2BAN ---
provision_fail2ban() {
    log "=== Fail2ban ==="
    if package_installed fail2ban; then log_skip "fail2ban already installed"
    else log_do "Installing fail2ban"; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban; fi
    local jail_local="/etc/fail2ban/jail.local"
    if [[ -f "$jail_local" ]]; then log_skip "fail2ban jail.local already configured"
    else log_do "Configuring fail2ban"; cp /etc/fail2ban/jail.conf "$jail_local"; sed -i 's/backend = auto/backend = systemd/' "$jail_local"; fi
    if systemctl is-active --quiet fail2ban; then log_skip "fail2ban already running"
    else log_do "Starting fail2ban"; systemctl enable --now fail2ban; fi
}

# --- AUTO UPDATES ---
provision_auto_updates() {
    log "=== Automatic security updates ==="
    if package_installed unattended-upgrades; then log_skip "unattended-upgrades already installed"
    else log_do "Installing unattended-upgrades"; DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades; fi
    local auto_upgrades="/etc/apt/apt.conf.d/20auto-upgrades"
    if [[ -f "$auto_upgrades" ]] && file_contains "$auto_upgrades" "Unattended-Upgrade"; then log_skip "Auto-upgrades already configured"
    else log_do "Configuring auto-upgrades"; cat > "$auto_upgrades" <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF
    fi
}

# --- NODE.JS ---
provision_nodejs() {
    log "=== Node.js ==="
    local nvm_dir="/home/$SERVICE_USER/.nvm"
    if [[ -d "$nvm_dir" ]]; then log_skip "nvm already installed for $SERVICE_USER"
    else log_do "Installing nvm for $SERVICE_USER"
        su - "$SERVICE_USER" -c 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash'
    fi
    if su - "$SERVICE_USER" -c "source ~/.nvm/nvm.sh && nvm ls $NODE_VERSION" 2>/dev/null | grep -q "$NODE_VERSION"; then
        log_skip "Node.js $NODE_VERSION already installed"
    else log_do "Installing Node.js $NODE_VERSION"
        su - "$SERVICE_USER" -c "source ~/.nvm/nvm.sh && nvm install $NODE_VERSION && nvm alias default $NODE_VERSION"
    fi
    # Create stable symlink for systemd (avoids glob patterns, survives minor upgrades)
    local node_bin
    node_bin=$(su - "$SERVICE_USER" -c "source ~/.nvm/nvm.sh && nvm which $NODE_VERSION" 2>/dev/null)
    if [[ -n "$node_bin" && -x "$node_bin" ]]; then
        if [[ "$(readlink -f /usr/local/bin/node 2>/dev/null)" == "$node_bin" ]]; then
            log_skip "Node symlink already points to $node_bin"
        else
            log_do "Creating /usr/local/bin/node symlink -> $node_bin"
            ln -sf "$node_bin" /usr/local/bin/node
        fi
    fi
}

# --- CERTBOT ---
provision_certbot() {
    log "=== Certbot ==="
    if command -v certbot &>/dev/null; then log_skip "certbot already installed"
    else log_do "Installing certbot via snap"
        snap install core 2>/dev/null || true; snap refresh core 2>/dev/null || true
        snap install --classic certbot; ln -sf /snap/bin/certbot /usr/bin/certbot
    fi
    local cert_path="/etc/letsencrypt/live/$DOMAIN"
    if [[ -d "$cert_path" ]]; then log_skip "Certificate for $DOMAIN already exists"
    else log ">>> Run manually: certbot certonly --standalone -d $DOMAIN"; fi
}

# --- CLONE REPO ---
provision_repo() {
    log "=== Repository ==="
    local repo_dir="/home/$SERVICE_USER/simpatico"
    if [[ -d "$repo_dir/.git" ]]; then log_skip "Repository already cloned"
    else log_do "Cloning repository"; su - "$SERVICE_USER" -c "git clone $SERVICE_REPO"; fi
    # Install dependencies
    log_do "Installing npm dependencies"
    su - "$SERVICE_USER" -c "source ~/.nvm/nvm.sh && cd ~/simpatico && npm install"
}

# --- SYSTEMD SERVICE ---
provision_systemd() {
    log "=== Systemd service ==="
    local service_file="/etc/systemd/system/simpatico.service"
    if [[ -f "$service_file" ]]; then log_skip "Systemd service already exists"
    else log_do "Creating systemd service"
        cat > "$service_file" <<EOF
[Unit]
Description=Simpatico Reflector Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/home/$SERVICE_USER/simpatico
ExecStart=/usr/local/bin/node server.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
        systemctl daemon-reload
    fi
}

# =============================================================================
# MAIN
# =============================================================================
main() {
    log "=========================================="
    log "Provisioning server for $DOMAIN"
    log "=========================================="

    provision_system
    provision_users
    provision_ssh
    provision_firewall
    provision_fail2ban
    provision_auto_updates
    provision_nodejs
    provision_certbot
    provision_repo
    provision_systemd

    # Start service if cert exists
    local cert_path="/etc/letsencrypt/live/$DOMAIN"
    if [[ -d "$cert_path" ]]; then
        log "=== Starting service ==="
        systemctl enable --now simpatico
        sleep 2
        if systemctl is-active --quiet simpatico; then
            log "Service started successfully"
        else
            log "WARNING: Service failed to start"
            journalctl -u simpatico -n 10 --no-pager
        fi
    fi

    log "=========================================="
    log "Provisioning complete!"
    log "=========================================="
    if [[ ! -d "$cert_path" ]]; then
        log ""
        log "Next steps:"
        log "  1. Get certificate: certbot certonly --standalone -d $DOMAIN"
        log "  2. Start service: systemctl enable --now simpatico"
    fi
    log "Check status: systemctl status simpatico"
    log "View logs: journalctl -u simpatico -f"
}

main "$@"
