#!/usr/bin/env bash
set -eo pipefail

# Configuration
ROOT_CA_CN_DEFAULT="Simpatico-Root-CA"
ROOT_CA_KEY="$HOME/.ssh/RootCA.key.pem"
ROOT_CA_CRT="$HOME/.ssh/RootCA.crt.pem"

function showUsage() {
  cat <<EOF
Usage: $0 <domain> [--cn "Common Name"]

Generates Root CA (20-year validity) and domain certificate with installation instructions

Common Name Options:
  --cn "Custom Name"   Set Root CA Common Name (default: "$ROOT_CA_CN_DEFAULT")

Requirements:
  - OpenSSL must be installed
  - ~/.ssh directory must exist
  - Run with appropriate permissions

Example:
  $0 example.test
  $0 example.test --cn "My-Custom-CA-Name"
EOF
  exit 1
}

function checkDependencies() {
  if ! command -v openssl &> /dev/null; then
    echo "❌ OpenSSL not found. Please install OpenSSL first."
    exit 1
  fi
}

function showOpensslVersion() {
  echo "🔐 OpenSSL Version: $(openssl version)"
}

function getExistingRootCN() {
  if [ -f "$ROOT_CA_CRT" ]; then
    openssl x509 -in "$ROOT_CA_CRT" -noout -subject 2>/dev/null | \
      sed -n 's/.*CN\s*=\s*\([^/]*\).*/\1/p' | \
      head -n 1
  fi
}

function generateRootCA() {
  local cn="$1"
  if [ ! -f "$ROOT_CA_CRT" ]; then
    echo "🔑 Generating Root CA '$cn' with 20-year validity..."
    mkdir -p ~/.ssh
    openssl req -x509 -nodes -new -sha256 -days 7300 -newkey rsa:2048 \
      -keyout "$ROOT_CA_KEY" \
      -out "$ROOT_CA_CRT" \
      -subj "/C=US/CN=$cn" || {
      echo "❌ Root CA generation failed"
      exit 1
    }
  else
    existing_cn=$(getExistingRootCN)
    echo "🔑 Using existing Root CA: CN='$existing_cn'"
  fi
}

function generateDomainCert() {
  local domain="$1"

  if [[ "$domain" == *.local ]]; then
    echo "❌ Domain ends with 'local' - conflicts with mDNS (RFC 6762)"
    exit 1
  fi


  echo "🔐 Generating/overwriting certificates for $domain..."
  cat << EOF > domains.ext
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names
[alt_names]
DNS.1 = localhost
DNS.2 = $domain
EOF

  openssl genpkey -algorithm RSA \
    -out "$domain.key.pem" \
    -pkeyopt rsa_keygen_bits:2048 || {
    echo "❌ Key generation failed"
    exit 1
  }

  openssl req -new -key "$domain.key.pem" \
    -out "$domain.csr.pem" \
    -subj "/C=US/ST=YourState/L=YourCity/O=Example-Certificates/CN=$domain" || {
    echo "❌ CSR generation failed"
    exit 1
  }

  openssl x509 -req -sha256 -days 825 \
    -in "$domain.csr.pem" \
    -CA "$ROOT_CA_CRT" \
    -CAkey "$ROOT_CA_KEY" \
    -CAcreateserial \
    -extfile domains.ext \
    -out "$domain.crt.pem" || {
    echo "❌ Certificate signing failed"
    exit 1
  }

  rm -f domains.ext "$domain.csr.pem"
}

function showInstallInstructions() {
  local domain="$1"
  local cn=$(getExistingRootCN)

  cat <<EOF

✅ Successfully generated:
   - $ROOT_CA_CRT (Root Certificate Authority)
   - $domain.key.pem (Private Key)
   - $domain.crt.pem (Certificate)

📌 INSTALLATION INSTRUCTIONS:

1. Install Root CA (CN: $cn) in browser:
   - Chrome: Settings > Privacy & Security > Security > Manage Certificates
   - Firefox: Options > Privacy & Security > Certificates > View Certificates
   - Import $ROOT_CA_CRT as Trusted Root Authority

2. if [[ "$domain" != *".localhost" && "$domain" != "localhost" ]]; then
       echo "Add domain to hosts file:"
       echo "   Windows: C:\Windows\System32\drivers\etc\hosts"
       echo "   Linux: /etc/hosts"
       echo "   Add: 127.0.0.1 $domain"
     else
       echo "Localhost domain detected - no hosts file modification needed"
     fi)

3. Server Configuration Options:

3a. Non-privileged ports (default):
   pnpm simpatico '{
     "hostname": "$domain",
     "useTls": true,
     "cert": "$domain.crt.pem",
     "key": "$domain.key.pem"
   }'


3b. Privileged ports (requires sudo):
   sudo pnpm simpatico '{
     "hostname": "$domain",
     "useTls": true,
     "cert": "$domain.crt.pem",
     "key": "$domain.key.pem",
     "runAsUser": "$(whoami)",
     "http": 80,
     "https": 443,
     "ws": 443
   }'


 3c Let's Encrypt (47-day validity, auto-renewal):
   1. Install Certbot: https://certbot.eff.org
   2. Generate certificates: sudo certbot certonly --standalone -d $domain -d www.$domain
   3. Certbot creates these files:
      - /etc/letsencrypt/live/$domain/fullchain.pem
      - /etc/letsencrypt/live/$domain/privkey.pem
   4. Use with Simpatico Server:
      sudo pnpm simpatico '{
        "hostname": "$domain",
        "useTls": true,
        "cert": "/etc/letsencrypt/live/$domain/fullchain.pem",
        "key": "/etc/letsencrypt/live/$domain/privkey.pem"
        "runAsUser": "$(whoami)",
        "http": 80,
        "https": 443,
        "ws": 443
      }'
EOF
}

# Parse arguments
positional_args=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cn)
      root_cn="$2"
      shift 2
      ;;
    -h|--help|help)
      showUsage
      ;;
    *)
      positional_args+=("$1")
      shift
      ;;
  esac
done

# Restore positional parameters
set -- "${positional_args[@]}"

# Main execution
checkDependencies
showOpensslVersion

[[ -z "$1" ]] && showUsage
domain="$1"
root_cn="${root_cn:-$ROOT_CA_CN_DEFAULT}"

generateRootCA "$root_cn"
generateDomainCert "$domain"
showInstallInstructions "$domain"
