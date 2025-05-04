// client.js - Browser client implementation
import { AuthClient, ClientState } from './auth-protocol.js';

export class WebSocketAuthClient extends AuthClient {
    constructor(options = {}) {
        super(options);
        this.socket = null;
        this.connected = false;
        this.messageQueue = [];
        this.messageHandlers = new Map();
    }

    /**
     * Connect to WebSocket server
     */
    async connect() {
        if (this.socket) {
            this.close();
        }

        return new Promise((resolve, reject) => {
            try {
                this.setState(ClientState.CONNECTING);

                // Create WebSocket connection
                this.socket = new WebSocket(this.serverUrl);

                // Set up event handlers
                this.socket.onopen = () => {
                    this.connected = true;
                    this.setState(ClientState.IDLE);

                    // Send any queued messages
                    while (this.messageQueue.length > 0) {
                        const msg = this.messageQueue.shift();
                        this.sendMessage(msg);
                    }

                    resolve();
                };

                this.socket.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        this.handleMessage(message);
                    } catch (error) {
                        this.handleError(new Error(`Failed to parse message: ${error.message}`));
                    }
                };

                this.socket.onerror = (error) => {
                    this.handleError(error);
                    reject(error);
                };

                this.socket.onclose = () => {
                    this.connected = false;
                    if (this.state !== ClientState.CLOSED) {
                        this.setState(ClientState.CLOSED);
                    }
                };
            } catch (error) {
                this.handleError(error);
                reject(error);
            }
        });
    }

    /**
     * Send message to server
     */
    sendMessage(message) {
        if (!this.connected) {
            this.messageQueue.push(message);
            return;
        }

        try {
            this.socket.send(JSON.stringify(message));
        } catch (error) {
            this.handleError(new Error(`Failed to send message: ${error.message}`));
        }
    }

    /**
     * Handle incoming message from server
     */
    handleMessage(message) {
        const { type, data } = message;

        // Process message based on type
        if (this.messageHandlers.has(type)) {
            this.messageHandlers.get(type)(data);
        } else {
            console.warn(`Unhandled message type: ${type}`);
        }
    }

    /**
     * Register message handler
     */
    onMessage(type, handler) {
        this.messageHandlers.set(type, handler);
        return this;
    }

    /**
     * Override close method to handle WebSocket
     */
    close() {
        super.close();

        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }

        return this;
    }

    /**
     * Override the authenticate method
     */
    async authenticate() {
        if (!this.connected) {
            await this.connect();
        }

        if (this.state !== ClientState.IDLE) {
            return this.handleError(new Error('Client not in IDLE state'));
        }

        if (!this.publicKey || !this.privateKey) {
            return this.handleError(new Error('Public or private key not provided'));
        }

        // Start timeout
        this.startTimer();

        // Send auth request
        this.setState(ClientState.REQUESTING_CHALLENGE);
        this.sendMessage({
            type: 'auth_request',
            data: {
                publicKey: this.publicKey
            }
        });

        return this;
    }

    /**
     * Set up message handlers for authentication flow
     */
    setupAuthHandlers() {
        // Handle challenge from server
        this.onMessage('auth_challenge', async (data) => {
            this.challenge = data.challenge;

            try {
                this.setState(ClientState.SIGNING_CHALLENGE);

                // In a real implementation, we would use actual crypto library
                // const signature = nacl.sign.detached(
                //   new Uint8Array(Buffer.from(this.challenge)),
                //   this.privateKey
                // );

                // For demo, simulate signing
                const signature = `signed-${this.challenge}-with-private-key`;

                this.setState(ClientState.SENDING_RESPONSE);
                this.sendMessage({
                    type: 'auth_response',
                    data: {
                        publicKey: this.publicKey,
                        challenge: this.challenge,
                        signature: signature
                    }
                });

                this.setState(ClientState.AWAITING_VERIFICATION);
            } catch (error) {
                this.handleError(error);
            }
        });

        // Handle auth result from server
        this.onMessage('auth_result', (data) => {
            this.stopTimer();

            if (data.success) {
                this.setState(ClientState.AUTHENTICATED, data);
            } else {
                this.setState(ClientState.REJECTED, data);
            }
        });

        // Handle errors from server
        this.onMessage('error', (data) => {
            this.handleError(new Error(data.message));
        });

        return this;
    }
}

// Example usage of WebSocketAuthClient
export function createAuthClient(serverUrl, keys) {
    const client = new WebSocketAuthClient({
        serverUrl,
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
        timeout: 30000
    });

    // Set up message handlers
    client.setupAuthHandlers();

    // Set up state change listener
    client.onStateChange((newState, prevState) => {
        console.log(`Client state changed: ${prevState} -> ${newState}`);
    });

    // Set up error listener
    client.onError((error) => {
        console.error('Client error:', error);
    });

    return client;
}

// Usage example
// const keys = generateKeys(); // You would implement this with nacl
// const client = createAuthClient('ws://localhost:3000', keys);
// client.connect().then(() => client.authenticate());