#!/usr/bin/env bash
set -eo pipefail

function showUsage() {
  cat <<EOF
Usage: $0 [command] [options]

Commands:
  generate-root-ca      Generate Root Certificate Authority (PEM format)
  generate-cert <domain> Generate domain certificate (PEM format)
  help                  Show this help message

Requirements:
  - OpenSSL must be installed
  - ~/.ssh directory must exist
  - Run with appropriate permissions

Example:
  $0 generate-root-ca
  $0 generate-cert example.com
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

function addToHosts() {
  cat <<EOF

📝 Hosts File Instructions:
Windows:  C:\Windows\System32\drivers\etc\hosts
Linux/macOS:  /etc/hosts

Add this entry:
127.0.0.1  $1
EOF
}

function generateRootCA() {
  echo "🔑 Generating Root CA in PEM format..."
  mkdir -p ~/.ssh
  openssl req -x509 -nodes -new -sha256 -days 1024 -newkey rsa:2048 \
    -keyout ~/.ssh/RootCA.key.pem \
    -out ~/.ssh/RootCA.crt.pem \
    -subj "/C=US/CN=Simpatico-Root-CA" || {
    echo "❌ Root CA generation failed"
    exit 1
  }

  echo "✅ Root CA generated:"
  echo "   - ~/.ssh/RootCA.key.pem (private key)"
  echo "   - ~/.ssh/RootCA.crt.pem (public certificate)"
  echo "📌 Install RootCA.crt.pem in your browser's Trusted Root Certification Authorities"
}

function generateSelfSignedCert() {
  local domain="${1:-}"
  [[ -z "$domain" ]] && {
    echo "❌ Missing domain argument"
    showUsage
  }

  echo "🔐 Generating PEM certificates for $domain..."

  cat << EOF > domains.ext
authorityKeyIdentifier=keyid,issuer
basicConstraints=CA:FALSE
keyUsage = digitalSignature, nonRepudiation, keyEncipherment, dataEncipherment
subjectAltName = @alt_names
[alt_names]
DNS.1 = localhost
DNS.2 = $domain
EOF

  # Generate private key (PEM format)
  openssl genpkey -algorithm RSA \
    -out "$domain.key.pem" \
    -pkeyopt rsa_keygen_bits:2048 || {
    echo "❌ Key generation failed"
    exit 1
  }

  # Generate CSR (PEM format)
  openssl req -new -key "$domain.key.pem" \
    -out "$domain.csr.pem" \
    -subj "/C=US/ST=YourState/L=YourCity/O=Example-Certificates/CN=$domain" || {
    echo "❌ CSR generation failed"
    exit 1
  }

  # Generate signed certificate (PEM format)
  openssl x509 -req -sha256 -days 1024 \
    -in "$domain.csr.pem" \
    -CA ~/.ssh/RootCA.crt.pem \
    -CAkey ~/.ssh/RootCA.key.pem \
    -CAcreateserial \
    -extfile domains.ext \
    -out "$domain.crt.pem" || {
    echo "❌ Certificate signing failed"
    exit 1
  }

  # Create combined PEM (optional, contains private key + certificate)
  cat "$domain.key.pem" "$domain.crt.pem" > "$domain.combined.pem"

  echo "✅ PEM files generated:"
  echo "   - $domain.key.pem (private key)"
  echo "   - $domain.crt.pem (public certificate)"
  echo "   - $domain.combined.pem (combined key+cert)"
  echo "📌 Use $domain.key.pem and $domain.crt.pem for TLS configuration"

  echo "run simpatico with something like node server.js '{"cert":"./simpatico.localhost.crt.pem","key":"./simpatico.localhost.key.pem","runAsUser":"josh","useCache":true,"useGzip":true,"useTls":true}'
"
}

# Main execution
checkDependencies
showOpensslVersion

case "$1" in
  generate-root-ca)
    generateRootCA
    addToHosts "simpatico.local"
    ;;
  generate-cert)
    generateSelfSignedCert "$2"
    ;;
  help|--help|-h|"")
    showUsage
    ;;
  *)
    echo "❌ Invalid command: $1"
    showUsage
    ;;
esac

exit 0
