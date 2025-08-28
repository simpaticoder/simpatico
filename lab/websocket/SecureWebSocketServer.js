import * as crypto from './crypto.js';

/**
 * ServerSecureWebSocket - Server-side secure WebSocket handler
 */
export default class SecureWebSocketServer {

    constructor(socket, onsecuremessage) {
        this.socket = socket;
        this.onsecuremessage = onsecuremessage;
        this.isRegistered = false;
        this.publicKey = null;
        this.onclose = null;
        this.onerror = null;
    }

    /**
     * Creates a new instance of SecureWebSocketServer, initializes it with the given parameters,
     * and returns the instance.
     *
     * @param {Object} socket - The socket object to be used for the server.
     * @param {Function} onsecuremessage - Callback function to handle secure messages. spelled to be consistent with onmessage
     * @param {number} [registrationTimeout=10000] - Optional timeout value for server registration in milliseconds. Defaults to 10000.
     * @return {Promise<SecureWebSocketServer>} A promise that resolves to the initialized SecureWebSocketServer instance.
     */
    static async create(socket, onsecuremessage, registrationTimeout = 10000) {
        const instance = new SecureWebSocketServer(socket, onsecuremessage);
        await instance.initialize(registrationTimeout);
        return instance;
    }

    async initialize(registrationTimeout) {
        try {
            await new Promise((resolve, reject) => {
                // 0. Make a random string, useful only for the lifetime of the registration protocol
                const nonce = crypto.encode(crypto.randomBytes(32));

                // 1. Socket registration protocol handler
                this.socket.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === "CHALLENGE_RESPONSE") {
                            const { publicKey, signature } = data;

                            if (this.verifyRegistration(publicKey, signature, nonce)) {
                                this.isRegistered = true;
                                this.publicKey = publicKey;
                                this.socket.send(JSON.stringify({ type: "REGISTER_SUCCESS" }));
                                this.socket.onclose = this?.onclose;
                                this.socket.onerror = this?.onerror;
                                this.setupSecureMessageHandling();
                                resolve();
                            } else {
                                this.socket.send(JSON.stringify({
                                    type: "REGISTER_FAILURE",
                                    reason: "Invalid signature"
                                }));
                                reject(new Error("Registration failed: Invalid signature"));
                            }
                        } else {
                            this.socket.send(JSON.stringify({
                                type: "REGISTER_FAILURE",
                                reason: "Unexpected message type" + data.type
                            }));
                            reject(new Error("Registration failed: Unexpected message type"));
                        }
                    } catch (error) {
                        reject(new Error(`Registration error: ${error.message}`));
                    }
                };

                // 2. General error mode handlers
                this.socket.onclose = () => {
                    reject(new Error("Connection closed during registration"));
                };
                this.socket.onerror = (error) => {
                    reject(new Error(`Connection error: ${error.message || error}`));
                };
                setTimeout(() => {
                    if (!this.isRegistered) {
                        reject(new Error("Registration timed out"));
                    }
                }, registrationTimeout);

                // 3. Send challenge
                this.socket.send(JSON.stringify({
                    type: "CHALLENGE",
                    nonce
                }));
            });

            return this;

        } catch (error) {
            throw new Error(`Failed to create secure server connection: ${error.message}`);
        }
    }

    verifyRegistration(publicKey, signature, nonce) {
        try {
            return crypto.verify(publicKey, signature, nonce);
        } catch (error) {
            console.error("Signature verification error:", error);
            return false;
        }
    }

    /**
     * Steady-state message handling - do some basic checking of the message envelop, and call onsecuremessage(data).
     */
    setupSecureMessageHandling() {
        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const {type, from, to, content} = data; //check that the message envelope is the right shape
                if (data.type === "MESSAGE") {
                    this?.onsecuremessage(data, this);
                }
            } catch (error) {
                console.error("Error handling secure message:", error);
            }
        };
    }

    send(message){
        if (!this.isRegistered) throw 'this socket is not registered and cannot send messages';
        // we could do message structure checking here, but the calling code is already doing this so it would be redundant.
        this.socket.send(message);
    }

    close() {
        if (this.socket) {
            this.socket.close();
        }
        this.isRegistered = false;
    }
}


