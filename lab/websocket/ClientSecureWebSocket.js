/**
 * ClientSecureWebSocket - A WebSocket wrapper that provides end-to-end encryption
 * using asymmetric cryptography (public/private key pairs)
 */
export default class ClientSecureWebSocket {
    /**
     * Creates a new secure WebSocket connection
     *
     * @param {string} publicKey - Your public key
     * @param {string} privateKey - Your private key (keep this secret!)
     * @param {WebSocket} socket - WebSocket connection
     * @param {function} onmessage - Callback that receives (err, decrypted_message).
     * @returns {Promise<ClientSecureWebSocket>} - A promise that resolves to the secure connection
     */
    constructor(publicKey, privateKey, socket = "wss://secure-messaging-server.example.com", onmessage) {

        return (async () => {
            if (!publicKey || typeof publicKey !== 'string') {
                throw new Error('Public key is required and must be a string');
            }
            if (!privateKey || typeof privateKey !== 'string') {
                throw new Error('Private key is required and must be a string');
            }
            if (!endpoint || typeof endpoint !== 'string') {
                throw new Error('Endpoint is required and must be a string');
            }
            if (!onmessage || typeof onmessage !== 'function') {
                throw new Error('onmessage callback is required and must be a function');
            }

            this.publicKey = publicKey;
            this.privateKey = privateKey;
            this.socket = socket;
            this.onmessage = onmessage;

            try {
                this.isRegistered = false;


                // Step 1: Wait for connection to establish
                await new Promise((resolve, reject) => {
                    this.socket.onopen = () => {
                        resolve();
                    };

                    this.socket.onclose = () => {
                        reject(new Error("Failed to establish connection"));
                    };

                    this.socket.onerror = (error) => {
                        reject(new Error(`Connection error: ${error}`));
                    };
                });

                // Step 2: Register public key with the server 3-way challenge response protocol.
                await new Promise((resolve, reject) => {
                    // Create a temp message handler for the registration process
                    const registrationHandler = async (event) => {
                        const data = JSON.parse(event.data);

                        switch (data.type) {
                            case "CHALLENGE":
                                // Send back the signed nonce
                                this.socket.send(JSON.stringify({
                                    type: "CHALLENGE_RESPONSE",
                                    publicKey: this.publicKey,
                                    signedNonce: sign(this.privateKey, data.nonce)
                                }));
                                break;

                            case "REGISTER_SUCCESS":
                                // Registration successful,  resolve
                                this.socket.onmessage = null;
                                this.isRegistered = true;
                                resolve();
                                break;

                            case "REGISTER_FAILURE":
                                // Registration failed
                                this.socket.onmessage = null;
                                reject(new Error(data.reason || "Registration failed"));
                                break;
                        }
                    };

                    // Add the temporary handler for registration messages
                    this.socket.onmessage = registrationHandler;

                    // Set a timeout for the registration process
                    setTimeout(() => {
                        this.socket.onmessage = null;
                        reject(new Error("Registration timed out"));
                    }, 5000);
                });

                // Step 3: If we got this far, we can send() and receive messages with onmessage
                socket.onmessage = event => {
                    const packet = event.data;
                    try {
                        const decryptedContent = crypto.decrypt(packet.from, this.privatekey, packet.content);
                        const parsedContent = JSON.parse(decryptedContent);
                        this.onmessage(null, {
                            type: "MESSAGE",
                            from: packet.from,
                            to: packet.to,
                            timestamp: packet.timestamp,
                            content: parsedContent
                        });
                    } catch (error) {
                        this.onmessage(new Error("Failed to decrypt message", {cause: {error, packet}}));
                    }
                };
                socket.onerror = err => this.onmessage(err);

                return this;

            } catch (error) {
                throw new Error("Failed to create secure connection", {cause: {error}});
            }
        })();
    }

    /**
     * Send an encrypted message to another user
     * @param recipientKey
     * @param {Object} message - Message object
     * @param {string} message.to - Recipient's public key
     * @param {Object} message.content - Message content (will be encrypted)
     */
    send(recipientKey, message) {
        if (!this.isRegistered) {
            throw new Error("Socket is not ready to send yet.");
        }
        if (!recipientKey || !message) {
            throw new Error("send requires a public key for the recipent and message object");
        }

        try {
            const encryptedContent = crypto.encrypt(JSON.stringify(message.content), recipientKey);
            const packet = {
                type: "MESSAGE",
                from: this.publicKey,
                to: recipientKey,
                timestamp: Date.now(),
                content: encryptedContent
            };
            this.socket.send(JSON.stringify(packet));
        } catch (error) {
            throw new Error(`Failed to send message: ${error.message}`);
        }
    }

    /**
     * Close the connection
     */
    close() {
        this.socket.close();
        this.isRegistered = false;
    }
}

