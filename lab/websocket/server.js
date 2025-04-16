// server.js - Node.js server implementation
import { WebSocketServer } from 'ws';
import { AuthServer, ServerState } from './auth-protocol.js';
import { createServer } from 'http';
import { randomBytes } from 'crypto';

export class WebSocketAuthServer extends AuthServer {
    constructor(options = {}) {
        super(options);
        this.httpServer = null;
        this.wsServer = null;
        this.clients = new Map(); // WebSocket clients
    }

    /**
     * Start WebSocket server
     */
    start() {
        if (this.state !== ServerState.IDLE) {
            return this.handleError(new Error('Server not in IDLE state'));
        }

        try {
            // Create HTTP server
            this.httpServer = createServer();

            // Create WebSocket server
            this.wsServer = new WebSocketServer({
                server: this.httpServer,
                clientTracking: true
            });

            // Handle new connections
            this.wsServer.on('connection', (socket, request) => {
                const clientId = this.generateClientId();

                // Store client socket
                this.clients.set(clientId, {
                    socket,
                    ip: request.socket.remoteAddress
                });

                // Initialize client in auth system
                this.handleConnection(clientId);

                // Set up event handlers
                socket.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        this.handleClientMessage(clientId, message);
                    } catch (error) {
                        this.handleError(new Error(`Failed to parse message: ${error.message}`), clientId);
                    }
                });

                socket.on('close', () => {
                    this.closeClient(clientId);
                });

                socket.on('error', (error) => {
                    this.handleError(error, clientId);
                });
            });

            // Handle server errors
            this.wsServer.on('error', (error) => {
                this.handleError(error);
            });

            // Start HTTP server
            this.httpServer.listen(this.port, () => {
                this.setState(ServerState.LISTENING, { port: this.port });
                console.log(`WebSocket server listening on port ${this.port}`);
            });
        } catch (error) {
            this.handleError(error);
        }

        return this;
    }

    /**
     * Stop WebSocket server
     */
    stop() {
        // Close all WebSocket connections
        if (this.wsServer) {
            for (const client of this.wsServer.clients) {
                client.terminate();
            }

            this.wsServer.close();
            this.wsServer = null;
        }

        // Close HTTP server
        if (this.httpServer) {
            this.httpServer.close();
            this.httpServer = null;
        }

        // Call parent method
        super.stop();

        return this;
    }

    /**
     * Handle client message
     */
    handleClientMessage(clientId, message) {
        const { type, data } = message;

        switch (type) {
            case 'auth_request':
                // Client is requesting authentication
                this.receivePublicKey(clientId, data.publicKey);
                break;

            case 'auth_response':
                // Client has responded to our challenge
                this.verifySignature(clientId, data.signature);
                break;

            default:
                console.warn(`Unhandled message type: ${type}`);
        }
    }

    /**
     * Send message to client
     */
    sendToClient(clientId, message) {
        const client = this.clients.get(clientId);
        if (!client) return false;

        try {
            client.socket.send(JSON.stringify(message));
            return true;
        } catch (error) {
            this.handleError(new Error(`Failed to send message: ${error.message}`), clientId);
            return false;
        }
    }

    /**
     * Override receivePublicKey to integrate with WebSocket
     */
    async receivePublicKey(clientId, publicKey) {
        const client = this.activeClients.get(clientId);
        if (!client) return;

        client.state = ServerState.GENERATING_CHALLENGE;
        client.publicKey = publicKey;

        // Check if we trust this key
        if (!this.trustedKeys.has(publicKey)) {
            this.rejectClient(clientId, 'Untrusted public key');
            return;
        }

        // Generate a random challenge
        const challenge = randomBytes(32).toString('hex');
        client.challenge = challenge;

        // Set challenge timeout
        this.setClientTimeout(clientId);

        // Update state and send challenge
        client.state = ServerState.SENDING_CHALLENGE;

        // Send challenge to client
        this.sendToClient(clientId, {
            type: 'auth_challenge',
            data: {
                challenge
            }
        });

        // Update state after sending
        client.state = ServerState.AWAITING_RESPONSE;
    }

    /**
     * Override verifySignature to integrate with WebSocket
     */
    async verifySignature(clientId, signature) {
        const client = this.activeClients.get(clientId);
        if (!client) return;

        client.state = ServerState.VERIFYING_SIGNATURE;

        // In a real implementation, verify with nacl
        // const verified = nacl.sign.detached.verify(
        //   new Uint8Array(Buffer.from(client.challenge)),
        //   signature,
        //   client.publicKey
        // );

        // For demo, simulate verification
        const verified = true;

        if (verified) {
            client.state = ServerState.CLIENT_AUTHENTICATED;
            this.clearClientTimeout(clientId);

            // Generate session token
            const sessionToken = randomBytes(16).toString('hex');

            // Notify successful authentication
            this.setState(ServerState.CLIENT_AUTHENTICATED, {
                clientId,
                publicKey: client.publicKey,
                sessionToken
            });

            // Send success response
            this.sendToClient(clientId, {
                type: 'auth_result',
                data: {
                    success: true,
                    message: 'Authentication successful',
                    sessionToken
                }
            });

            // Clean up active client
            this.activeClients.delete(clientId);
        } else {
            this.rejectClient(clientId, 'Invalid signature');
        }
    }

    /**
     * Override rejectClient to integrate with WebSocket
     */
    rejectClient(clientId, reason) {
        const client = this.activeClients.get(clientId);
        if (!client) return;

        client.state = ServerState.CLIENT_REJECTED;
        this.clearClientTimeout(clientId);

        // Notify rejection
        this.setState(ServerState.CLIENT_REJECTED, {
            clientId,
            reason
        });

        // Send rejection message
        this.sendToClient(clientId, {
            type: 'auth_result',
            data: {
                success: false,
                message: reason
            }
        });

        // Clean up
        this.activeClients.delete(clientId);
    }

    /**
     * Override closeClient to integrate with WebSocket
     */
    closeClient(clientId) {
        super.closeClient(clientId);

        // Close socket if it exists
        const client = this.clients.get(clientId);
        if (client) {
            try {
                client.socket.close();
            } catch (error) {
                console.error(`Error closing socket: ${error.message}`);
            }

            this.clients.delete(clientId);
        }
    }

    /**
     * Generate unique client ID
     */
    generateClientId() {
        return `client-${Date.now()}-${randomBytes(4).toString('hex')}`;
    }
}

// Example usage of WebSocketAuthServer
export function createAuthServer(options = {}) {
    // Load trusted keys (in a real app, from a secure store)
    const trustedKeys = new Map();

    // Example trusted key (in a real app, this would be actual public keys)
    trustedKeys.set('client-public-key-1', {
        name: 'Example Client',
        permissions: ['read', 'write']
    });

    // Create server
    const server = new WebSocketAuthServer({
        port: options.port || 3000,
        trustedKeys,
        challengeTimeout: options.timeout || 60000
    });

    // Set up state change listener
    server.onStateChange((newState, prevState, data) => {
        console.log(`Server state changed: ${prevState} -> ${newState}`);

        if (newState === ServerState.CLIENT_AUTHENTICATED) {
            console.log(`Client authenticated: ${data.clientId}`);
        }
    });

    // Set up error listener
    server.onError((error, clientId) => {
        if (clientId) {
            console.error(`Error with client ${clientId}:`, error);
        } else {
            console.error('Server error:', error);
        }
    });

    return server;
}

// Example main function
export async function main() {
    const server = createAuthServer({ port: 3000 });

    // Graceful shutdown
    process.on('SIGINT', () => {
        console.log('Shutting down server...');
        server.stop();
        process.exit(0);
    });

    // Start server
    server.start();
}

// Uncomment to run the server directly
// main().catch(console.error);