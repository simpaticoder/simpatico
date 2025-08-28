import * as crypto from "./crypto.js";

const {encode, decode, stringToBits, bitsToString} = crypto;
/**
 * ServerSecureWebSocket - Server-side secure WebSocket wrapper
 */
export default class SecureWebSocketServer {

    constructor(socket, serverKeys, onsecuremessage) {
        this.socket = socket;
        this.serverKeys = serverKeys;
        this.onsecuremessage = onsecuremessage;
        this.isRegistered = false;
        this.publicKey = null;
        this.onclose = null;
        this.onerror = null;
    }

    static generateKeys(){
        return crypto.generateEncryptionKeys();
    }
    /**
     * Creates a new instance of SecureWebSocketServer, initializes it with the given parameters,
     * and returns the instance.
     *
     * @param {Object} socket - The socket object to be used for the server.
     * @param serverKeys
     * @param {Function} onsecuremessage - Callback function to handle secure messages. spelled to be consistent with onmessage
     * @param {number} [registrationTimeout=10000] - Optional timeout value for server registration in milliseconds. Defaults to 10000.
     * @return {Promise<SecureWebSocketServer>} A promise that resolves to the initialized SecureWebSocketServer instance.
     */
    static async create(socket, serverKeys, onsecuremessage, registrationTimeout = 10000) {
        const instance = new SecureWebSocketServer(socket, serverKeys, onsecuremessage);
        await instance.initialize(registrationTimeout);
        return instance;
    }

    async initialize(registrationTimeout) {
        try {
            await new Promise((resolve, reject) => {
                // 0. Make a random string, useful only for the lifetime of the registration protocol
                const nonceBits = crypto.getRandomValues();
                const messageString = 'Simpatico ' + new Date();
                const messageBits = stringToBits(messageString);

                // 1. Socket registration protocol handler
                this.socket.onmessage = (event) => {
                    try {
                        const envelope = JSON.parse(event.data);

                        if (envelope.type === "CHALLENGE_RESPONSE") {
                            if ( !this.isValidChallengeResponse(envelope, messageBits, nonceBits) ) {
                                this.socket.send(JSON.stringify({
                                    type: "REGISTER_FAILURE",
                                    reason: "Invalid ciphertext"
                                }));
                                reject(new Error("Registration failed: Invalid ciphertext"));
                                return;
                            }

                            this.isRegistered = true;
                            this.publicKey = envelope.publicKey;
                            this.socket.onclose = this?.onclose;
                            this.socket.onerror = this?.onerror;
                            this.setupSecureMessageHandling();
                            this.socket.send(JSON.stringify({ type: "REGISTER_SUCCESS" }));
                            resolve(this);

                        } else {
                            this.socket.send(JSON.stringify({
                                type: "REGISTER_FAILURE",
                                reason: "Unexpected message type" + envelope.type
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

                // 3. Send challenge - server sends clear text server public key, and expect client to properly encrypt it.
                this.socket.send(JSON.stringify({
                    type: 'CHALLENGE',
                    from: this.serverKeys.publicKeyString,
                    nonce: encode(nonceBits),
                    message: messageString,
                }));
            });

            return this;

        } catch (error) {
            throw new Error(`Failed to create secure server connection: ${error.message}`);
        }
    }

    isValidChallengeResponse(envelope, expectedMessageBits, serverNonceBits){
        if (decode(envelope.nonce) !== serverNonceBits) return false;
        const clientPublicKeyBits = decode(envelope.publicKey);
        const sharedSecret = crypto.deriveSharedSecret(this.serverKeys.privateKeyBits, clientPublicKeyBits);
        const clearMessageBits = crypto.decryptMessage(envelope, sharedSecret, false);
        return (clearMessageBits === expectedMessageBits);
    }

    setupSecureMessageHandling() {
        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
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


