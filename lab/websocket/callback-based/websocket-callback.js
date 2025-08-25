import nacl from '/vendor/nacl.js';

// Note: use EventTarget instead (node 15+ and browsers)
class EventEmitter {
    constructor() {
        this.listeners = {};
    }

    on(event, callback) {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
        return this;
    }

    emit(event, ...args) {
        if (!this.listeners[event]) return;
        this.listeners[event].forEach(callback => callback(...args));
    }
}

/**
 * Store all client connections, support broadcast()
 * Note that the type of client is an event emitter that supports 'message' and 'close'
 */
class SimulatedWebSocketServer extends EventEmitter {
    constructor() {
        super();
        // Set is okay for now with broadcast; eventually should be a Map publicKeyToClient
        this.clients = new Set();
        this.clientToPublicKey = new Map(); // Will store public key associations
        logMessage("Server: initialized");
    }

    // Handle a new client connection
    addClient(client) {
        this.clients.add(client);
        logMessage(`Server: ${client.name} connected`);

        client.on('close', () => {
            this.clients.delete(client);
            this.clientToPublicKey.delete(client);
            logMessage(`Server: ${client.name} disconnected`);
        });
    }

    // Send a message to all connected clients except the sender
    broadcast(data, sender) {
        this.clients.forEach(client => {
            if (client !== sender) {
                client.emit('message', data);
            }
        });
    }
}

/**
 * Support a subset of basic WebSocket events (open, send, close).
 * Simulates a 100ms delay between construction and "open".
 */
class SimulatedWebSocketClient extends EventEmitter {
    constructor(url, name) {
        super();
        this.url = url;
        this.name = name;
        this.readyState = 0; // Connecting
        logMessage(`Client: ${name} connecting to ${url}`);

        // Simulate connection establishment
        setTimeout(() => {
            this.readyState = 1; // Connected
            this.emit('open');
        }, 100);
    }

    // Send a message to the server
    send(data) {
        if (this.readyState === 1) {
            this.emit('outgoing_message', data);
        } else {
            logMessage(`Client: ${this.name} ERROR: Connection not open`);
        }
    }

    // Close the connection
    close() {
        this.readyState = 3; // Closed
        this.emit('close');
    }
}


// ============================================================

const CryptoUtils = {
    // Generate random bytes for nonce
    generateRandomBytes: (length) => {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return array;
    },

    // Convert between formats
    arrayBufferToBase64: (buffer) => {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    },

    base64ToUint8Array: (base64) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    },

    // Generate key pair
    generateKeyPair: () => {
        return nacl.sign.keyPair();
    },

    // Sign data with private key
    sign: (data, privateKey) => {
        return nacl.sign.detached(data, privateKey);
    },

    // Verify signature
    verify: (data, signature, publicKey) => {
        return nacl.sign.detached.verify(data, signature, publicKey);
    }
};

/**
 * add more state about pending and completed registration challenges
 * register event handlers on client
 */
class SecureWebSocketServer extends SimulatedWebSocketServer {
    constructor() {
        super();
        // Track authentication states and challenges
        this.pendingChallenges = new Map(); // client -> nonce
        this.authenticatedClients = new Set();
        logMessage("Server: secure version initialized");
    }

    addClient(client) {
        this.clients.add(client);
        logMessage(`Server: ${client.name} connected - initiating challenge on open`);
        // If client is already open, issue challenge now
        if (client.readyState === 1) {
            this.issueChallenge(client);
        } else {
            // Otherwise wait for open event
            client.on('open', () => this.issueChallenge(client));
        }

        client.on('outgoing_message', (message) => {
            this.handleMessage(client, message);
        });

        client.on('close', () => {
            this.clients.delete(client);
            this.pendingChallenges.delete(client);
            this.authenticatedClients.delete(client);
            this.clientToPublicKey.delete(client);
            logMessage(`Server: ${client.name} disconnected`);
        });
    }

    /**
     * Issue a challenge {type: 'challenge', nonce: [24 random bytes]}
     *
     * @param client
     */
    issueChallenge(client) {
        const nonce = CryptoUtils.generateRandomBytes(24);
        this.pendingChallenges.set(client, nonce);

        const challenge = {
            type: 'challenge',
            nonce: CryptoUtils.arrayBufferToBase64(nonce)
        };

        client.emit('message', JSON.stringify(challenge));
        logMessage(`Server: Challenge issued to ${client.name} with nonce: ${challenge.nonce}`);
    }

    // Process incoming messages based on type
    handleMessage(client, rawMessage) {
        try {
            const message = JSON.parse(rawMessage);

            switch (message.type) {
                case 'auth_response':
                    this.handleAuthResponse(client, message);
                    break;

                case 'secure_message':
                    this.handleSecureMessage(client, message);
                    break;

                default:
                    logMessage(`Server: Unknown message type: ${message.type}`);
            }
        } catch (error) {
            logMessage("EServer: error processing message:", error);
        }
    }

    // Verify the signature of the nonce
    handleAuthResponse(client, response) {
        const nonce = this.pendingChallenges.get(client);
        if (!nonce) {
            logMessage("Server: No pending challenge for this client");
            return;
        }

        try {
            const publicKey = CryptoUtils.base64ToUint8Array(response.publicKey);
            const signature = CryptoUtils.base64ToUint8Array(response.signature);

            // Verify the signature of the nonce
            const isValid = CryptoUtils.verify(nonce, signature, publicKey);

            if (isValid) {
                // Authentication successful
                this.authenticatedClients.add(client);
                this.clientToPublicKey.set(client, publicKey);

                // Associate this public key with the client for future communication
                const authSuccess = {
                    type: 'auth_success',
                    message: 'Authentication successful'
                };
                client.emit('message', JSON.stringify(authSuccess));
                logMessage("Server: Client authenticated successfully");
            } else {
                // Authentication failed
                const authFailure = {
                    type: 'auth_failure',
                    message: 'Signature verification failed'
                };
                client.emit('message', JSON.stringify(authFailure));
                logMessage("Server: Authentication failed - invalid signature");
            }
        } catch (error) {
            logMessage("Authentication error:", error);
            client.emit('message', JSON.stringify({
                type: 'auth_failure',
                message: 'Authentication error'
            }));
        } finally {
            this.pendingChallenges.delete(client);
        }
    }

    // The steady state - route based on public key
    handleSecureMessage(client, message) {
        if (!this.authenticatedClients.has(client)) {
            logMessage("Server: Unauthenticated client attempting to send secure message");
            return;
        }

        if (!message.targetPublicKey) {
            // Broadcast to all authenticated clients except sender
            this.authenticatedClients.forEach(recipient => {
                if (recipient !== client) {
                    recipient.emit('message', JSON.stringify({
                        type: 'secure_message',
                        from: CryptoUtils.arrayBufferToBase64(this.clientToPublicKey.get(client)),
                        content: message.content
                    }));
                }
            });
        } else {
            // Find the client with the matching public key
            const targetPublicKey = CryptoUtils.base64ToUint8Array(message.targetPublicKey);
            let targetClient = null;

            for (const [candidate, publicKey] of this.clientToPublicKey.entries()) {
                if (publicKey.length === targetPublicKey.length &&
                    publicKey.every((byte, i) => byte === targetPublicKey[i])) {
                    targetClient = candidate;
                    break;
                }
            }

            if (targetClient) {
                targetClient.emit('message', JSON.stringify({
                    type: 'secure_message',
                    from: CryptoUtils.arrayBufferToBase64(this.clientToPublicKey.get(client)),
                    content: message.content
                }));
            } else {
                logMessage("Target client not found");
                client.emit('message', JSON.stringify({
                    type: 'error',
                    message: 'Target client not found'
                }));
            }
        }
    }
}

// Enhanced WebSocket Client with authentication capabilities
class SecureWebSocketClient extends SimulatedWebSocketClient {
    constructor(url, name) {
        super(url, name);
        // Generate key pair on initialization
        this.keyPair = CryptoUtils.generateKeyPair();
        this.authenticated = false;
        logMessage(`Client: ${name} initialized with key pair`);

        // Set up message handler
        this.on('message', (rawMessage) => {
            this.handleMessage(rawMessage);
        });
    }

    // Process incoming messages based on type
    handleMessage(rawMessage) {
        try {
            const message = JSON.parse(rawMessage);

            switch (message.type) {
                case 'challenge':
                    this.handleChallenge(message);
                    break;

                case 'auth_success':
                    this.authenticated = true;
                    logMessage(`Client: ${this.name} Authentication successful`);
                    this.emit('authenticated');
                    break;

                case 'auth_failure':
                    logMessage(`Client: ${this.name} Authentication failed:`, message.message);
                    break;

                case 'secure_message':
                    this.emit('secure_message', {
                        from: message.from,
                        content: message.content
                    });
                    break;

                case 'error':
                    logMessage(`Client: ${this.name} error from server:`, message.message);
                    break;

                default:
                    logMessage(`Client: ${this.name} Unknown message type: ${message.type}`);
            }
        } catch (error) {
            logMessage(`Client: ${this.name} Error processing message:`, error);
        }
    }

    // Handle challenge from server
    handleChallenge(challenge) {
        const nonce = CryptoUtils.base64ToUint8Array(challenge.nonce);

        // Sign the nonce with our private key
        const signature = CryptoUtils.sign(nonce, this.keyPair.secretKey);

        // Send back the auth response
        const response = {
            type: 'auth_response',
            publicKey: CryptoUtils.arrayBufferToBase64(this.keyPair.publicKey),
            signature: CryptoUtils.arrayBufferToBase64(signature)
        };

        this.send(JSON.stringify(response));
        logMessage(`Client: ${this.name} Sent authentication response`);
    }

    // Send a secure message
    sendSecureMessage(content, targetPublicKey = null) {
        if (!this.authenticated) {
            logMessage(`Client: ${this.name} Cannot send message - not authenticated`);
            return;
        }

        const message = {
            type: 'secure_message',
            content
        };

        if (targetPublicKey) {
            message.targetPublicKey = targetPublicKey;
        }

        this.send(JSON.stringify(message));
    }

    // Get this client's public key as Base64
    getPublicKeyBase64() {
        return CryptoUtils.arrayBufferToBase64(this.keyPair.publicKey);
    }
}

function logMessage(message, ex) {
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageContainer.appendChild(messageElement);
    }
    console.log(message, ex);
}

export {
    SimulatedWebSocketClient, SimulatedWebSocketServer,
    SecureWebSocketClient, SecureWebSocketServer,
    logMessage
};