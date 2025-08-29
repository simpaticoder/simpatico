import * as crypto from "./crypto.js";

const {encode, decode, stringToBits, bitsToString} = crypto;

export default class SecureWebSocketClient {

    // user has all the keys and contacts
    constructor(user, onmessage) {
        this.user = user;
        this.onmessage = onmessage;
        this.isRegistered = false;

        this.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.wsUrl = `${this.protocol}//${window.location.host}/${user.publicKeyString}`;
        this.socket = new WebSocket(this.wsUrl);
    }

    static async create(user, onmessage, registrationTimeout = 10000){
        const instance = new SecureWebSocketClient(user, onmessage);
        await instance.initialize(registrationTimeout);
        return instance;
    }

    async initialize(registrationTimeout){
        // Step 1: Wait for connection to establish
        await new Promise((resolve, reject) => {
            this.socket.onopen = () => {
                resolve(this);
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


            this.socket.onmessage = (event) => {
                const envelope = JSON.parse(event.data);
                switch (envelope.type) {
                    case "CHALLENGE":
                        const serverPublicKeyBits = decode(envelope.from);
                        const nonceBits = decode(envelope.nonce);
                        const sharedSecret = crypto.deriveSharedSecret(this.user.privateKeyBits, serverPublicKeyBits);
                        const challengeResponseEnvelope = crypto.encryptMessage(this.user, {sharedSecret}, envelope.message, "CHALLENGE_RESPONSE", false, nonceBits);
                        this.socket.send(JSON.stringify(challengeResponseEnvelope));
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

            // Set a timeout for the registration process
            setTimeout(() => {
                this.socket.onmessage = null;
                reject(new Error("Registration timed out"));
            }, registrationTimeout);
        });

        // Step 3: If we got this far, we can receive messages with onmessage (and send())
        this.socket.onmessage = event => {
            const envelope = JSON.parse(event.data);
            // we can rely on the server to assert that to, from, nonce, and message are all present.
            // reject message if not from a contact -- note that we could allow this to be an "introduction" and let the user add the contact.
            const contact = this.user.contacts[envelope.from];
            if (contact === null) throw 'contact not found in user contacts ' + envelope.from;

            try {
                const decryptedMessageObject = crypto.decryptMessage(envelope, contact.sharedSecret);
                this.onmessage(null, {
                    type: "MESSAGE",
                    from: contact,
                    message: decryptedMessageObject
                });
            } catch (error) {
                this.onmessage(new Error("Failed to decrypt message", {cause: {error, packet}}));
            }
        };
        this.socket.onerror = err => this.onmessage(err);
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
            this.socket.send(JSON.stringify(envelope));
        } catch (error) {
            throw new Error(`Failed to decrypt message: ${error.message}`);
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
