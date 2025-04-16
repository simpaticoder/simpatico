import nacl from '/s/vendor/nacl.js';

const CryptoUtils = {
    generateRandomBytes: (length) => {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return array;
    },

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

    generateKeyPair: () => nacl.sign.keyPair(),

    sign: (data, privateKey) => nacl.sign.detached(data, privateKey),

    verify: (data, signature, publicKey) =>
        nacl.sign.detached.verify(data, signature, publicKey)
};

// Message bus for simulating communication
class MessageBus {
    constructor() {
        this.subscribers = new Map();
    }

    subscribe(channel, callback) {
        if (!this.subscribers.has(channel)) {
            this.subscribers.set(channel, new Set());
        }
        this.subscribers.get(channel).add(callback);
        return () => this.subscribers.get(channel).delete(callback);
    }

    publish(channel, message) {
        if (this.subscribers.has(channel)) {
            this.subscribers.get(channel).forEach(callback => callback(message));
        }
    }
}

// States for the client state machine
const ClientState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    WAITING_FOR_CHALLENGE: 'waiting_for_challenge',
    AUTHENTICATING: 'authenticating',
    AUTHENTICATED: 'authenticated',
    ERROR: 'error'
};

// States for the server state machine
const ServerClientState = {
    CONNECTED: 'connected',
    CHALLENGE_ISSUED: 'challenge_issued',
    AUTHENTICATED: 'authenticated',
    DISCONNECTED: 'disconnected'
};

// Client implementation
class PKIClient {
    constructor(id, bus) {
        this.id = id;
        this.bus = bus;
        this.keyPair = CryptoUtils.generateKeyPair();
        this.publicKeyB64 = CryptoUtils.arrayBufferToBase64(this.keyPair.publicKey);
        this.state = ClientState.DISCONNECTED;
        this.handlers = new Map();

        // Subscribe to messages from server
        this.unsubscribe = this.bus.subscribe(`client.${id}`, message => {
            this.handleMessage(message);
        });

        console.log(`Client ${id}: Initialized in ${this.state} state`);
    }

    connect() {
        if (this.state !== ClientState.DISCONNECTED) {
            console.error(`Client ${this.id}: Cannot connect. Current state: ${this.state}`);
            return;
        }

        this.setState(ClientState.CONNECTING);

        // Send connection request
        this.bus.publish('server', {
            type: 'connect',
            clientId: this.id
        });

        // Transition to waiting for challenge
        this.setState(ClientState.WAITING_FOR_CHALLENGE);

        console.log(`Client ${this.id}: Connection request sent`);
    }

    handleMessage(message) {
        console.log(`Client ${this.id}: Received message in state ${this.state}`, message.type);

        switch (this.state) {
            case ClientState.WAITING_FOR_CHALLENGE:
                if (message.type === 'challenge') {
                    this.handleChallenge(message);
                } else {
                    console.error(`Client ${this.id}: Unexpected message type in state ${this.state}:`, message.type);
                }
                break;

            case ClientState.AUTHENTICATING:
                if (message.type === 'auth_success') {
                    this.setState(ClientState.AUTHENTICATED);
                    this.notifyListeners('authenticated');
                } else if (message.type === 'auth_failure') {
                    this.setState(ClientState.ERROR);
                    console.error(`Client ${this.id}: Authentication failed:`, message.reason);
                } else {
                    console.error(`Client ${this.id}: Unexpected message type in state ${this.state}:`, message.type);
                }
                break;

            case ClientState.AUTHENTICATED:
                if (message.type === 'message') {
                    this.notifyListeners('message', {
                        from: message.from,
                        content: message.content
                    });
                }
                break;

            default:
                console.error(`Client ${this.id}: Cannot handle message in state ${this.state}`);
        }
    }

    handleChallenge(challenge) {
        console.log(`Client ${this.id}: Processing challenge`);

        // Convert from base64
        const nonceBytes = CryptoUtils.base64ToUint8Array(challenge.nonce);

        // Sign the nonce
        const signature = CryptoUtils.sign(nonceBytes, this.keyPair.secretKey);
        const signatureB64 = CryptoUtils.arrayBufferToBase64(signature);

        // Transition state
        this.setState(ClientState.AUTHENTICATING);

        // Send authentication response
        this.bus.publish('server', {
            type: 'auth_response',
            clientId: this.id,
            publicKey: this.publicKeyB64,
            signature: signatureB64
        });

        console.log(`Client ${this.id}: Sent authentication response`);
    }

    sendMessage(content, toPublicKey = null) {
        if (this.state !== ClientState.AUTHENTICATED) {
            console.error(`Client ${this.id}: Cannot send message in state ${this.state}`);
            return;
        }

        this.bus.publish('server', {
            type: 'client_message',
            from: this.id,
            toPublicKey,
            content
        });

        console.log(`Client ${this.id}: Sent message to ${toPublicKey ? 'specific recipient' : 'all'}`);
    }

    disconnect() {
        if (this.state === ClientState.DISCONNECTED) {
            return;
        }

        this.bus.publish('server', {
            type: 'disconnect',
            clientId: this.id
        });

        this.setState(ClientState.DISCONNECTED);
        this.unsubscribe();

        console.log(`Client ${this.id}: Disconnected`);
    }

    setState(newState) {
        console.log(`Client ${this.id}: State transition ${this.state} -> ${newState}`);
        this.state = newState;
    }

    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, []);
        }
        this.handlers.get(event).push(handler);
    }

    notifyListeners(event, data = null) {
        if (this.handlers.has(event)) {
            this.handlers.get(event).forEach(handler => handler(data));
        }
    }
}

// Server implementation
class PKIServer {
    constructor(bus) {
        this.bus = bus;
        this.clients = new Map(); // clientId -> state object
        this.clientToPublicKey = new Map(); // clientId -> publicKey
        this.publicKeyToClient = new Map(); // publicKey -> clientId

        // Listen for client messages
        this.unsubscribe = this.bus.subscribe('server', message => {
            this.handleMessage(message);
        });

        console.log('Server: Initialized');
    }

    handleMessage(message) {
        console.log('Server: Received message', message.type);

        switch (message.type) {
            case 'connect':
                this.handleConnect(message.clientId);
                break;

            case 'auth_response':
                this.handleAuthResponse(message.clientId, message.publicKey, message.signature);
                break;

            case 'client_message':
                this.handleClientMessage(message.from, message.toPublicKey, message.content);
                break;

            case 'disconnect':
                this.handleDisconnect(message.clientId);
                break;

            default:
                console.error('Server: Unknown message type:', message.type);
        }
    }

    handleConnect(clientId) {
        console.log(`Server: Client ${clientId} connecting`);

        // Create new client state
        const nonce = CryptoUtils.generateRandomBytes(24);
        const nonceB64 = CryptoUtils.arrayBufferToBase64(nonce);

        this.clients.set(clientId, {
            state: ServerClientState.CONNECTED,
            nonce
        });

        // Send challenge
        this.bus.publish(`client.${clientId}`, {
            type: 'challenge',
            nonce: nonceB64
        });

        // Update client state
        this.clients.get(clientId).state = ServerClientState.CHALLENGE_ISSUED;

        console.log(`Server: Challenge issued to ${clientId}`);
    }

    handleAuthResponse(clientId, publicKey, signature) {
        console.log(`Server: Processing auth response from ${clientId}`);

        const client = this.clients.get(clientId);
        if (!client || client.state !== ServerClientState.CHALLENGE_ISSUED) {
            console.error(`Server: Invalid auth response from ${clientId}`);
            return;
        }

        try {
            const publicKeyBytes = CryptoUtils.base64ToUint8Array(publicKey);
            const signatureBytes = CryptoUtils.base64ToUint8Array(signature);

            // Verify signature
            const isValid = CryptoUtils.verify(client.nonce, signatureBytes, publicKeyBytes);

            if (isValid) {
                // Authentication successful
                this.clients.get(clientId).state = ServerClientState.AUTHENTICATED;

                // Store key associations
                this.clientToPublicKey.set(clientId, publicKey);
                this.publicKeyToClient.set(publicKey, clientId);

                // Send success message
                this.bus.publish(`client.${clientId}`, {
                    type: 'auth_success'
                });

                console.log(`Server: Client ${clientId} authenticated successfully`);
            } else {
                // Authentication failed
                this.bus.publish(`client.${clientId}`, {
                    type: 'auth_failure',
                    reason: 'Invalid signature'
                });

                console.log(`Server: Client ${clientId} authentication failed - invalid signature`);
            }
        } catch (error) {
            this.bus.publish(`client.${clientId}`, {
                type: 'auth_failure',
                reason: 'Error processing authentication'
            });

            console.error(`Server: Error processing authentication for ${clientId}:`, error);
        }
    }

    handleClientMessage(fromClientId, toPublicKey, content) {
        console.log(`Server: Message from ${fromClientId}`);

        const client = this.clients.get(fromClientId);
        if (!client || client.state !== ServerClientState.AUTHENTICATED) {
            console.error(`Server: Unauthenticated message from ${fromClientId}`);
            return;
        }

        const fromPublicKey = this.clientToPublicKey.get(fromClientId);

        if (!toPublicKey) {
            // Broadcast to all authenticated clients except sender
            this.clients.forEach((clientState, clientId) => {
                if (clientId !== fromClientId && clientState.state === ServerClientState.AUTHENTICATED) {
                    this.bus.publish(`client.${clientId}`, {
                        type: 'message',
                        from: fromPublicKey,
                        content
                    });
                }
            });

            console.log(`Server: Broadcast message from ${fromClientId}`);
        } else {
            // Direct message
            const toClientId = this.publicKeyToClient.get(toPublicKey);
            if (!toClientId) {
                console.error(`Server: Target client with key ${toPublicKey} not found`);
                return;
            }

            this.bus.publish(`client.${toClientId}`, {
                type: 'message',
                from: fromPublicKey,
                content
            });

            console.log(`Server: Routed message from ${fromClientId} to ${toClientId}`);
        }
    }

    handleDisconnect(clientId) {
        console.log(`Server: Client ${clientId} disconnecting`);

        const client = this.clients.get(clientId);
        if (!client) {
            console.error(`Server: Unknown client ${clientId} disconnecting`);
            return;
        }

        // Clean up key associations
        const publicKey = this.clientToPublicKey.get(clientId);
        if (publicKey) {
            this.publicKeyToClient.delete(publicKey);
            this.clientToPublicKey.delete(clientId);
        }

        // Update client state
        this.clients.get(clientId).state = ServerClientState.DISCONNECTED;

        console.log(`Server: Client ${clientId} disconnected`);
    }

    shutdown() {
        this.unsubscribe();
        console.log('Server: Shut down');
    }
}

// Demo function
function runDemo() {
    const bus = new MessageBus();

    // Create server
    const server = new PKIServer(bus);

    // Create clients
    const alice = new PKIClient('Alice', bus);
    const bob = new PKIClient('Bob', bus);

    // Set up event handlers
    alice.on('authenticated', () => {
        console.log('Demo: Alice authenticated');

        // Check if Bob is authenticated and send message
        const checkInterval = setInterval(() => {
            if (bob.state === ClientState.AUTHENTICATED) {
                clearInterval(checkInterval);

                // Send direct message
                alice.sendMessage('Hello Bob, this is Alice!', bob.publicKeyB64);

                // Send broadcast
                setTimeout(() => {
                    alice.sendMessage('Hello everyone, this is Alice broadcasting!');
                }, 500);
            }
        }, 100);
    });

    bob.on('message', (message) => {
        console.log(`Demo: Bob received message from ${message.from}: ${message.content}`);
    });

    alice.on('message', (message) => {
        console.log(`Demo: Alice received message from ${message.from}: ${message.content}`);
    });

    // Connect clients
    alice.connect();
    bob.connect();

    console.log('Demo: Started');

    // Return cleanup function
    return () => {
        alice.disconnect();
        bob.disconnect();
        server.shutdown();
    };
}

// Run the demo
const cleanup = runDemo();

// To clean up later:
// cleanup();