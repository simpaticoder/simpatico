import * as crypto from "./crypto.js";
const {encode, decode, stringToBits, bitsToString, uint8ArrayEquals} = crypto;

// Debugging - see secure.socket.md for coordination instructions
let DEBUG = true;

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

    static async create(user, onmessage, registrationTimeout = 10000, DEBUG_FLAG){
        DEBUG = DEBUG_FLAG;
        const instance = new SecureWebSocketClient(user, onmessage);
        await instance.initialize(registrationTimeout);
        return instance;
    }

    async initialize(registrationTimeout){

        // Step 1: Wait for connection to establish
        await new Promise((resolve, reject) => {
            this.socket.onopen = () => {
                console.debug('1. Client opens a websocket');
                resolve(this);
            }
            this.socket.onclose = () => reject(new Error("Failed to establish connection"));
            this.socket.onerror = (error) => reject(new Error(`Connection error: ${error}`));
        });

        // Step 2: Wait for server challenge.
        await new Promise((resolve, reject) => {
            this.socket.onmessage = (event) => {
                const envelope = JSON.parse(event.data);
                switch (envelope.type) {
                    case "CHALLENGE":
                        console.debug("2. Client receive challengeEnvelope", envelope);
                        const serverPublicKeyBits = decode(envelope.from);
                        const nonceBits = decode(envelope.nonce);

                        // one or both of these arguments is wrong
                        console.info(encode(this.user.privateKeyBits), envelope.from)
                        const sharedSecret = crypto.deriveSharedSecret(this.user.privateKeyBits, serverPublicKeyBits);
                        if (DEBUG){
                            // use server private key to rederive the shared secret
                            const serverSharedSecret= crypto.deriveSharedSecret(decode(envelope.serverPrivateKey), this.user.publicKeyBits);
                            // FAIL  - check consistency with locally derived shared secret
                            console.assert(uint8ArrayEquals(sharedSecret, serverSharedSecret), "check consistency with locally derived shared secret");
                        }

                        console.debug("2a. Client derives shared secret ", encode(sharedSecret));
                        console.debug("serverPublicKey, clientPublicKey", [envelope.from, this.user.publicKeyString]);
                        // generate an encrypted response - reuse the nonce given by the server.
                        const challengeResponseEnvelope = crypto.encryptMessage(
                            this.user, {publicKeyString: envelope.from, sharedSecret},
                            envelope.challengeText, "CHALLENGE_RESPONSE",
                            false, nonceBits
                        );
                        if (DEBUG){
                            challengeResponseEnvelope.sharedSecret = encode(sharedSecret);
                            challengeResponseEnvelope.clientPrivateKey = this.user.privateKeyString;
                        }

                        console.debug("2b. Client sends encrypted envelope ", challengeResponseEnvelope);
                        this.socket.send(JSON.stringify(challengeResponseEnvelope));
                        break;

                    case "REGISTER_SUCCESS":
                        console.debug('5a. Registration success')
                        this.socket.onmessage = null;
                        this.isRegistered = true;
                        resolve();
                        break;

                    case "REGISTER_FAILURE":
                        console.debug('5a. Registration failure')
                        this.socket.onmessage = null;
                        reject(new Error());
                        break;
                }
            };

            // 2. Any close, error, or timeout is a registration failure.
            this.socket.onclose = () =>  reject(new Error("Connection closed during registration"));
            this.socket.onerror = (error) => reject(new Error(`Connection error: ${error.message || error}`));
            setTimeout(() => {
                if (this.isRegistered) return;
                this.socket.onmessage = null;
                reject(new Error("Registration timed out"));
            }, registrationTimeout);
        });

        // Step 3: If we got this far, we can receive messages with onmessage (and send())
        this.socket.onmessage = this.receive;
        this.socket.onclose = this.close;
        this.socket.onerror = err => this?.onerror(err);
    }

    // pass decrypted message to this.onmessage()
    receive({data}){
        const envelope = JSON.parse(data);
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
        if (this.socket.readyState !== this.socket.CLOSED) {
            this.socket.close();
        }
        this.isRegistered = false;
    }

}
