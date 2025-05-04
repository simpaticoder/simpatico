/**
 * States for the Client FSM
 */
export const ClientState = {
    IDLE: 'IDLE',
    CONNECTING: 'CONNECTING',
    REQUESTING_CHALLENGE: 'REQUESTING_CHALLENGE',
    SIGNING_CHALLENGE: 'SIGNING_CHALLENGE',
    SENDING_RESPONSE: 'SENDING_RESPONSE',
    AWAITING_VERIFICATION: 'AWAITING_VERIFICATION',
    AUTHENTICATED: 'AUTHENTICATED',
    REJECTED: 'REJECTED',
    ERROR: 'ERROR',
    TIMED_OUT: 'TIMED_OUT',
    CLOSED: 'CLOSED'
};

/**
 * States for the Server FSM
 */
export const ServerState = {
    IDLE: 'IDLE',
    LISTENING: 'LISTENING',
    RECEIVING_KEY: 'RECEIVING_KEY',
    GENERATING_CHALLENGE: 'GENERATING_CHALLENGE',
    SENDING_CHALLENGE: 'SENDING_CHALLENGE',
    AWAITING_RESPONSE: 'AWAITING_RESPONSE',
    VERIFYING_SIGNATURE: 'VERIFYING_SIGNATURE',
    CLIENT_AUTHENTICATED: 'CLIENT_AUTHENTICATED',
    CLIENT_REJECTED: 'CLIENT_REJECTED',
    ERROR: 'ERROR',
    TIMED_OUT: 'TIMED_OUT',
    CLOSED: 'CLOSED'
};

/**
 * Client implementation for challenge-response authentication
 */
export class AuthClient {
    constructor(options = {}) {
        this.state = ClientState.IDLE;
        this.publicKey = options.publicKey || null;
        this.privateKey = options.privateKey || null;
        this.serverUrl = options.serverUrl || null;
        this.timeout = options.timeout || 30000; // 30 seconds default
        this.challenge = null;
        this.timer = null;
        this.stateChangeListeners = [];
        this.errorListeners = [];
    }

    /**
     * Add state change listener
     */
    onStateChange(callback) {
        this.stateChangeListeners.push(callback);
        return this;
    }

    /**
     * Add error listener
     */
    onError(callback) {
        this.errorListeners.push(callback);
        return this;
    }

    /**
     * Update state and notify listeners
     */
    setState(newState, data = null) {
        const prevState = this.state;
        this.state = newState;

        // Notify listeners
        for (const listener of this.stateChangeListeners) {
            listener(newState, prevState, data);
        }

        return this;
    }

    /**
     * Handle errors
     */
    handleError(error) {
        this.setState(ClientState.ERROR, error);

        for (const listener of this.errorListeners) {
            listener(error);
        }

        return this;
    }

    /**
     * Start authentication process
     */
    async authenticate() {
        if (this.state !== ClientState.IDLE) {
            return this.handleError(new Error('Client not in IDLE state'));
        }

        if (!this.publicKey || !this.privateKey) {
            return this.handleError(new Error('Public or private key not provided'));
        }

        if (!this.serverUrl) {
            return this.handleError(new Error('Server URL not provided'));
        }

        // Set timeout
        this.startTimer();

        try {
            this.setState(ClientState.CONNECTING);
            // Connection logic would go here

            await this.requestChallenge();
        } catch (error) {
            this.handleError(error);
        }

        return this;
    }

    /**
     * Request challenge from server
     */
    async requestChallenge() {
        this.setState(ClientState.REQUESTING_CHALLENGE);

        try {
            // Here we would make actual request to server
            // For demonstration, we'll simulate it
            const response = await this.simulateRequest({
                action: 'requestChallenge',
                publicKey: this.publicKey
            });

            this.challenge = response.challenge;
            await this.signChallenge();
        } catch (error) {
            this.handleError(error);
        }
    }

    /**
     * Sign the challenge with private key
     */
    async signChallenge() {
        this.setState(ClientState.SIGNING_CHALLENGE);

        try {
            // In a real implementation, this would use the actual signing function
            // e.g., nacl.sign.detached(challenge, privateKey)
            const signature = `signed-${this.challenge}-with-private-key`;

            await this.sendResponse(signature);
        } catch (error) {
            this.handleError(error);
        }
    }

    /**
     * Send signature response to server
     */
    async sendResponse(signature) {
        this.setState(ClientState.SENDING_RESPONSE);

        try {
            this.setState(ClientState.AWAITING_VERIFICATION);

            // Send signature to server
            const response = await this.simulateRequest({
                action: 'verifySignature',
                publicKey: this.publicKey,
                challenge: this.challenge,
                signature
            });

            if (response.verified) {
                this.stopTimer();
                this.setState(ClientState.AUTHENTICATED, response);
            } else {
                this.stopTimer();
                this.setState(ClientState.REJECTED, response);
            }
        } catch (error) {
            this.handleError(error);
        }
    }

    /**
     * Close the connection
     */
    close() {
        this.stopTimer();
        this.setState(ClientState.CLOSED);
        // Clean up resources if needed
        return this;
    }

    /**
     * Start timeout timer
     */
    startTimer() {
        this.stopTimer(); // Clear any existing timer

        this.timer = setTimeout(() => {
            if (![ClientState.AUTHENTICATED, ClientState.REJECTED, ClientState.CLOSED].includes(this.state)) {
                this.setState(ClientState.TIMED_OUT);
                this.handleError(new Error('Authentication timed out'));
            }
        }, this.timeout);
    }

    /**
     * Stop timeout timer
     */
    stopTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /**
     * Simulate a network request
     * This would be replaced with actual network code in a real implementation
     */
    async simulateRequest(data) {
        return new Promise((resolve) => {
            setTimeout(() => {
                // Simulate server responses
                if (data.action === 'requestChallenge') {
                    resolve({ challenge: 'random-challenge-string' });
                } else if (data.action === 'verifySignature') {
                    resolve({ verified: true, session: 'auth-session-token' });
                }
            }, 500); // Simulate network delay
        });
    }
}

/**
 * Server implementation for challenge-response authentication
 */
export class AuthServer {
    constructor(options = {}) {
        this.state = ServerState.IDLE;
        this.port = options.port || 3000;
        this.trustedKeys = options.trustedKeys || new Map();
        this.challengeTimeout = options.challengeTimeout || 60000; // 1 minute default
        this.activeClients = new Map(); // Map of active authentication processes
        this.stateChangeListeners = [];
        this.errorListeners = [];
    }

    /**
     * Add state change listener
     */
    onStateChange(callback) {
        this.stateChangeListeners.push(callback);
        return this;
    }

    /**
     * Add error listener
     */
    onError(callback) {
        this.errorListeners.push(callback);
        return this;
    }

    /**
     * Update server state and notify listeners
     */
    setState(newState, data = null) {
        const prevState = this.state;
        this.state = newState;

        // Notify listeners
        for (const listener of this.stateChangeListeners) {
            listener(newState, prevState, data);
        }

        return this;
    }

    /**
     * Handle errors
     */
    handleError(error, clientId = null) {
        this.setState(ServerState.ERROR, { error, clientId });

        for (const listener of this.errorListeners) {
            listener(error, clientId);
        }

        return this;
    }

    /**
     * Start server
     */
    start() {
        if (this.state !== ServerState.IDLE) {
            return this.handleError(new Error('Server not in IDLE state'));
        }

        this.setState(ServerState.LISTENING, { port: this.port });

        // In a real implementation, this would set up an HTTP server or WebSocket
        console.log(`Server listening on port ${this.port}`);

        return this;
    }

    /**
     * Stop server
     */
    stop() {
        // Close all active client connections
        for (const [clientId, client] of this.activeClients) {
            this.closeClient(clientId);
        }

        this.setState(ServerState.CLOSED);

        return this;
    }

    /**
     * Handle new client connection
     */
    handleConnection(clientId) {
        // Create new client context
        this.activeClients.set(clientId, {
            state: ServerState.RECEIVING_KEY,
            publicKey: null,
            challenge: null,
            timer: null,
            timestamp: Date.now()
        });

        return this;
    }

    /**
     * Process an authentication request from a client
     */
    async handleAuthRequest(clientId, message) {
        const client = this.activeClients.get(clientId);

        if (!client) {
            return this.handleError(new Error('Unknown client'), clientId);
        }

        try {
            switch (client.state) {
                case ServerState.RECEIVING_KEY:
                    return this.receivePublicKey(clientId, message.publicKey);

                case ServerState.AWAITING_RESPONSE:
                    return this.verifySignature(clientId, message.signature);

                default:
                    throw new Error(`Invalid state for client ${clientId}: ${client.state}`);
            }
        } catch (error) {
            this.handleError(error, clientId);
            this.closeClient(clientId);
        }
    }

    /**
     * Process public key from client and generate challenge
     */
    async receivePublicKey(clientId, publicKey) {
        const client = this.activeClients.get(clientId);
        client.state = ServerState.GENERATING_CHALLENGE;
        client.publicKey = publicKey;

        // Check if we trust this key
        if (!this.trustedKeys.has(publicKey)) {
            this.rejectClient(clientId, 'Untrusted public key');
            return;
        }

        // Generate a random challenge
        // In real implementation, this would use crypto.randomBytes or similar
        const challenge = `challenge-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
        client.challenge = challenge;

        // Set challenge timeout
        this.setClientTimeout(clientId);

        // Update state and send challenge
        client.state = ServerState.SENDING_CHALLENGE;

        // Send challenge to client
        // In a real implementation, this would use the actual transport
        console.log(`Sending challenge to client ${clientId}: ${challenge}`);

        // Update state after sending
        client.state = ServerState.AWAITING_RESPONSE;
    }

    /**
     * Verify signature from client
     */
    async verifySignature(clientId, signature) {
        const client = this.activeClients.get(clientId);
        client.state = ServerState.VERIFYING_SIGNATURE;

        // In a real implementation, this would use the actual verification
        // e.g., nacl.sign.detached.verify(challenge, signature, publicKey)
        const verified = true; // Simulated result

        if (verified) {
            client.state = ServerState.CLIENT_AUTHENTICATED;
            this.clearClientTimeout(clientId);

            // Generate session token or credentials in a real implementation
            const sessionToken = `session-${Date.now()}-${clientId}`;

            // Notify successful authentication
            this.setState(ServerState.CLIENT_AUTHENTICATED, {
                clientId,
                publicKey: client.publicKey,
                sessionToken
            });

            // In a real implementation, send success response with session token
            console.log(`Client ${clientId} authenticated successfully`);

            // Clean up
            this.activeClients.delete(clientId);
        } else {
            this.rejectClient(clientId, 'Invalid signature');
        }
    }

    /**
     * Reject a client
     */
    rejectClient(clientId, reason) {
        const client = this.activeClients.get(clientId);
        if (!client) return;

        client.state = ServerState.CLIENT_REJECTED;
        this.clearClientTimeout(clientId);

        // Notify rejection
        this.setState(ServerState.CLIENT_REJECTED, { clientId, reason });

        // In a real implementation, send rejection message
        console.log(`Client ${clientId} rejected: ${reason}`);

        // Clean up
        this.activeClients.delete(clientId);
    }

    /**
     * Close client connection
     */
    closeClient(clientId) {
        const client = this.activeClients.get(clientId);
        if (!client) return;

        this.clearClientTimeout(clientId);

        // In a real implementation, close the connection
        console.log(`Closing connection with client ${clientId}`);

        // Clean up
        this.activeClients.delete(clientId);
    }

    /**
     * Set timeout for challenge-response
     */
    setClientTimeout(clientId) {
        const client = this.activeClients.get(clientId);
        if (!client) return;

        this.clearClientTimeout(clientId);

        client.timer = setTimeout(() => {
            client.state = ServerState.TIMED_OUT;

            // Handle timeout
            this.setState(ServerState.TIMED_OUT, { clientId });
            console.log(`Authentication timed out for client ${clientId}`);

            // Clean up
            this.activeClients.delete(clientId);
        }, this.challengeTimeout);
    }

    /**
     * Clear timeout for client
     */
    clearClientTimeout(clientId) {
        const client = this.activeClients.get(clientId);
        if (!client || !client.timer) return;

        clearTimeout(client.timer);
        client.timer = null;
    }
}

/**
 * Example usage of the module
 */
export function example() {
    // Create server with trusted keys
    const server = new AuthServer({
        port: 3000,
        trustedKeys: new Map([
            ['client-public-key', { name: 'Example Client' }]
        ])
    });

    // Start server
    server.start();

    // Create client
    const client = new AuthClient({
        publicKey: 'client-public-key',
        privateKey: 'client-private-key',
        serverUrl: 'https://example.com/auth'
    });

    // Set up listeners
    client.onStateChange((newState, prevState) => {
        console.log(`Client state changed: ${prevState} -> ${newState}`);
    });

    server.onStateChange((newState, prevState, data) => {
        console.log(`Server state changed: ${prevState} -> ${newState}`, data);
    });

    // Start authentication process
    client.authenticate();

    // In a real implementation, server would receive requests
    // and client would wait for responses
}