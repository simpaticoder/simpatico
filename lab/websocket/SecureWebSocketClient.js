import * as crypto from "./crypto.js";
const {encode, decode, stringToBits, bitsToString, uint8ArrayEquals} = crypto;

export default class SecureWebSocketClient {
    constructor(user, onmessage) {
        this.user = user;
        this.onmessage = onmessage;
        this.onclose = null;
        this.onerror = null;
        this.isRegistered = false;

        // compute the correct websocket url and create a low-level Websocket
        this.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.wsUrl = `${this.protocol}//${window.location.host}/${user.publicKeyString}`;
        this.socket = new WebSocket(this.wsUrl);
    }

    static async create(user, onmessage, registrationTimeout = 10000){
        const instance = new SecureWebSocketClient(user, onmessage);
        await instance.initialize(registrationTimeout);
        return instance;
    }

    async initialize(registrationTimeout) {
        try {
            await this.waitForConnection();
            await this.handleRegistration(registrationTimeout);

            this.socket.onmessage = event => this.receive(event, this.user);
            this.socket.onclose = this.close;
            this.socket.onerror = err => this?.onerror(err);

        } catch (error) {
            this.cleanup(error);
        }
    }

    cleanup(error) {
        this.isRegistered = false;
        if (this.socket.readyState !== WebSocket.CLOSED) {
            this.socket.send(JSON.stringify(error));
            this.socket.close();
        }
        this.socket.onmessage = null;
        this.socket.onclose = null;
        this.socket.onerror = null;
    }

    async waitForConnection() {
        return new Promise((resolve, reject) => {
            this.socket.onopen = () => resolve();
            this.socket.onclose = () => reject(new Error("Failed to establish connection"));
            this.socket.onerror = (error) => reject(new Error(`Connection error: ${error}`));
        });
    }

    async handleRegistration(registrationTimeout) {
        return new Promise((resolve, reject) => {

            const timeoutId = setTimeout(() => {
                if (!this.isRegistered) reject(new Error("Registration timed out"));
            }, registrationTimeout);

            this.socket.onmessage = (event) => {
                const envelope = JSON.parse(event.data);
                switch (envelope.type) {
                    case "CHALLENGE":
                        console.debug("2. Client receive challengeEnvelope", envelope);
                        const serverPublicKeyBits = decode(envelope.from);
                        const nonceBits = decode(envelope.nonce);

                        const sharedSecret = crypto.deriveSharedSecret(this.user.privateKeyBits, serverPublicKeyBits);
                        console.debug("2a. Client derives shared secret ", encode(sharedSecret));

                        // generate an encrypted response - reuse the nonce given by the server.
                        const to = {publicKeyString: envelope.from, sharedSecret}
                        const challengeResponseEnvelope = crypto.encryptMessage(
                            this.user,
                            to,
                            envelope.challengeText,
                            "CHALLENGE_RESPONSE",
                            false,
                            nonceBits
                        );
                        console.debug("2b. Client generates challenge response envelope ", challengeResponseEnvelope);
                        // send the challenge response envelope
                        this.socket.send(JSON.stringify(challengeResponseEnvelope));
                        break;

                    case "REGISTER_SUCCESS":
                        console.debug('5a. Registration success');
                        this.isRegistered = true;
                        clearTimeout(timeoutId);
                        resolve();
                        break;

                    case "REGISTER_FAILURE":
                        console.debug('5b. Registration failure');
                        clearTimeout(timeoutId);
                        const errorMessage = envelope.error || "Registration failed";
                        reject(new Error(errorMessage));
                        break;
                    default:
                        reject(new Error('Unexpected message type during registration:', envelope.type));
                }
            };

            this.socket.onclose = () => {
                clearTimeout(timeoutId);
                reject(new Error("Connection closed during registration"));
            };

            this.socket.onerror = (error) => {
                clearTimeout(timeoutId);
                reject(new Error(`Connection error during registration: ${error.message || error}`));
            };
        });
    }

    // pass decrypted message to this.onmessage()
    receive(event, user){
        console.debug('[SWSClient] receive raw:', event.data.slice(0, 200));
        let envelope;
        try {
            envelope = JSON.parse(event.data);
        } catch (e) {
            console.debug('[SWSClient] JSON.parse failed:', e.message);
            this?.onmessage(new Error(`Invalid envelope: ${e.message}`), { type: "ERROR", raw: event.data });
            return;
        }

        // Ignore server control messages (MESSAGE_DELIVERED, etc.)
        if (!envelope.from || !envelope.message || !envelope.nonce) {
            console.debug('[SWSClient] ignored non-envelope:', envelope);
            if (envelope.error) {
                this?.onmessage(new Error(envelope.error), { type: "ERROR", envelope });
            }
            return;
        }

        console.debug('[SWSClient] envelope from', envelope.from.slice(0, 16));

        // look up the contact — auto-add unknowns
        let contact = user.contacts[envelope.from];
        if (!contact) {
            console.debug('[SWSClient] auto-adding contact', envelope.from.slice(0, 16));
            contact = {
                publicKeyString: envelope.from,
                publicKeyBits: decode(envelope.from),
                sharedSecret: crypto.deriveSharedSecret(user.privateKeyBits, decode(envelope.from))
            };
            user.contacts[envelope.from] = contact;
        }

        // decrypt the message
        try {
            const decryptedMessageObject = crypto.decryptMessage(envelope, contact.sharedSecret);
            console.debug('[SWSClient] decrypted:', decryptedMessageObject);
            this?.onmessage(null, {
                type: "MESSAGE",
                from: contact,
                message: decryptedMessageObject
            });
        } catch (e) {
            console.debug('[SWSClient] decryption failed:', e.message);
            this?.onmessage(new Error(`Decryption failed: ${e.message}`), { type: "ERROR", from: contact, envelope });
        }
    }

    /**
     * Send an encrypted message to another user
     *
     * @param contact A contact in user.contacts that has a sharedSecret and a publicKeyString
     * @param {Object} message - Message object
     * @param {string} message.to - Recipient's public key
     * @param {Object} message.content - Message content (will be encrypted)
     */
    send(contact, message) {
        if (!this.isRegistered) {
            throw new Error("Socket is not ready to send yet.");
        }
        if (!contact || !message) {
            throw new Error("send requires a public key for the recipent and message object");
        }
        try {
            const envelope = crypto.encryptMessage(this.user, contact, message);
            console.debug('[SWSClient] send envelope to', contact.publicKeyString.slice(0, 16), 'type', message.type || '(text)');
            this.socket.send(JSON.stringify(envelope));
        } catch (error) {
            console.debug('[SWSClient] send failed:', error.message);
            throw new Error(`Failed to send message: ${error.message}`);
        }
    }

    /**
     * Close the connection
     */
    close() {
        if (this.socket.readyState !== this.socket.CLOSED) {
            this.socket.close();
        }
        this.isRegistered = false;
    }
}