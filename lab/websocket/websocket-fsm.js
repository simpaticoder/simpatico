import {CryptoUtils} from "./crypto-utils.js";

// Message bus for simulating communication
export class MessageBus {
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
export const ClientState = {
    DISCONNECTED: 'disconnected',
    CONNECTING: 'connecting',
    WAITING_FOR_CHALLENGE: 'waiting_for_challenge',
    AUTHENTICATING: 'authenticating',
    AUTHENTICATED: 'authenticated',
    ERROR: 'error'
};

// States for the server state machine
export const ServerClientState = {
    CONNECTED: 'connected',
    CHALLENGE_ISSUED: 'challenge_issued',
    AUTHENTICATED: 'authenticated',
    DISCONNECTED: 'disconnected'
};

// Client implementation
export class PKIClient {
    constructor(id, bus, logger=console.log) {
        this.id = id;
        this.bus = bus;
        this.logger = logger;
        this.keyPair = CryptoUtils.generateKeyPair();
        this.publicKeyB64 = CryptoUtils.arrayBufferToBase64(this.keyPair.publicKey);
        this.state = ClientState.DISCONNECTED;
        this.handlers = new Map();

        // Subscribe to messages from server
        this.unsubscribe = this.bus.subscribe(`client.${id}`, message => {
            this.handleMessage(message);
        });

        this.logger(`PKIClient ${id}: Initialized in ${this.state} state`);
    }

    connect() {
        if (this.state !== ClientState.DISCONNECTED) {
            this.logger(`Client ${this.id}: Cannot connect. Current state: ${this.state}`);
            return;
        }
        this.setState(ClientState.WAITING_FOR_CHALLENGE);
        this.logger(`Client ${this.id}: Connection request sent`);
        // Send connection request
        this.bus.publish('server', {
            type: 'connect',
            clientId: this.id
        });
    }

    handleMessage(message) {
        this.logger(`Client ${this.id}: Received message in state: ${this.state} message: ${JSON.stringify(message)}`, );

        switch (this.state) {
            case ClientState.WAITING_FOR_CHALLENGE:
                if (message.type === 'challenge') {
                    this.handleChallenge(message);
                } else {
                    this.logger(`Error: Client ${this.id}: Unexpected message type in state ${this.state}:`, message.type);
                }
                break;

            case ClientState.AUTHENTICATING:
                if (message.type === 'auth_success') {
                    this.setState(ClientState.AUTHENTICATED);
                    this.notifyListeners('authenticated');
                } else if (message.type === 'auth_failure') {
                    this.setState(ClientState.ERROR);
                    this.logger(`Error: Client ${this.id}: Authentication failed:`, message.reason);
                } else {
                    this.logger(`Error: Client ${this.id}: Unexpected message type in state ${this.state}:`, message.type);
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
                this.logger(`Error: Client ${this.id}: Cannot handle message in state ${this.state}`);
        }
    }

    handleChallenge(challenge) {
        this.logger(`Client ${this.id}: Processing challenge`);

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
    }

    sendMessage(content, toPublicKey = null) {
        if (this.state !== ClientState.AUTHENTICATED) {
            this.logger(`Error: Client ${this.id}: Cannot send message in state ${this.state}`);
            return;
        }

        this.bus.publish('server', {
            type: 'client_message',
            from: this.id,
            toPublicKey,
            content
        });

        this.logger(`Client ${this.id}: Sent message to ${toPublicKey ? 'specific recipient' : 'all'}`);
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

        this.logger(`Client ${this.id}: Disconnected`);
    }

    setState(newState) {
        this.logger(`Client ${this.id}: State transition ${this.state} -> ${newState}`);
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
export class PKIServer {
    constructor(bus, logger=console.log) {
        this.bus = bus;
        this.logger = logger;
        this.clients = new Map(); // clientId -> state object
        this.clientToPublicKey = new Map(); // clientId -> publicKey
        this.publicKeyToClient = new Map(); // publicKey -> clientId

        // Listen for client messages
        this.unsubscribe = this.bus.subscribe('server', message => {
            this.handleMessage(message);
        });

        this.logger('PKIServer: Initialized');
    }

    handleMessage(message) {
        this.logger('Server: Received message' + JSON.stringify(message));

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
                this.logger('Server: Unknown message type:', message.type);
        }
    }

    handleConnect(clientId) {
        this.logger(`Server: Client ${clientId} connecting`);

        // Create new client state
        const nonce = CryptoUtils.generateRandomBytes(24);
        const nonceB64 = CryptoUtils.arrayBufferToBase64(nonce);

        this.clients.set(clientId, {
            state: ServerClientState.CONNECTED,
            nonce
        });

        // Send challenge
        this.clients.get(clientId).state = ServerClientState.CHALLENGE_ISSUED;
        this.logger(`Server: Challenge issued to ${clientId}`);
        this.bus.publish(`client.${clientId}`, {
            type: 'challenge',
            nonce: nonceB64
        });
    }

    handleAuthResponse(clientId, publicKey, signature) {
        this.logger(`Server: Processing auth response from ${clientId}`);

        const client = this.clients.get(clientId);
        if (!client || client.state !== ServerClientState.CHALLENGE_ISSUED) {
            this.logger(`Server: Invalid auth response from ${clientId} ${client.state}`);
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

                this.logger(`Server: Client ${clientId} authenticated successfully`);
            } else {
                // Authentication failed
                this.bus.publish(`client.${clientId}`, {
                    type: 'auth_failure',
                    reason: 'Invalid signature'
                });

                this.logger(`Server: Client ${clientId} authentication failed - invalid signature`);
            }
        } catch (error) {
            this.bus.publish(`client.${clientId}`, {
                type: 'auth_failure',
                reason: 'Error processing authentication'
            });

            this.logger(`Server: Error processing authentication for ${clientId}:`, error);
        }
    }

    handleClientMessage(fromClientId, toPublicKey, content) {
        this.logger(`Server: Message from ${fromClientId} content: ${content}`);

        const client = this.clients.get(fromClientId);
        if (!client || client.state !== ServerClientState.AUTHENTICATED) {
            this.logger(`Server: Unauthenticated message from ${fromClientId}`);
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

            this.logger(`Server: Broadcast message from ${fromClientId}`);
        } else {
            // Direct message
            const toClientId = this.publicKeyToClient.get(toPublicKey);
            if (!toClientId) {
                this.logger(`Server: Target client with key ${toPublicKey} not found`);
                return;
            }

            this.bus.publish(`client.${toClientId}`, {
                type: 'message',
                from: fromPublicKey,
                content
            });

            this.logger(`Server: Routed message from ${fromClientId} to ${toClientId}`);
        }
    }

    handleDisconnect(clientId) {
        this.logger(`Server: Client ${clientId} disconnecting`);

        const client = this.clients.get(clientId);
        if (!client) {
            this.logger(`Server: Unknown client ${clientId} disconnecting`);
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

        this.logger(`Server: Client ${clientId} disconnected`);
    }

    shutdown() {
        this.unsubscribe();
        this.logger('Server: Shut down');
    }
}



