import * as crypto from "./crypto.js";
const {encode, decode, stringToBits, bitsToString, uint8ArrayEquals} = crypto;

// Debugging - see secure.socket.md for coordination instructions
const DEBUG = true;

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

    static async create(socket, serverKeys, onsecuremessage, registrationTimeout = 10000) {
        const instance = new SecureWebSocketServer(socket, serverKeys, onsecuremessage);
        await instance.initialize(registrationTimeout);
        return instance;
    }

    async initialize(registrationTimeout) {
        const nonceBits = crypto.getRandomValues();
        const expectedMessageString =  'Simpatico Welcomes You! ' + new Date();

        await new Promise((resolve, reject) => {
            this.socket.onmessage = (event) => {
                try {
                    const envelope = JSON.parse(event.data);
                    switch (envelope.type) {
                        case "CHALLENGE_RESPONSE":
                            console.debug("3. Server receive challengeResponseEnvelope", envelope);
                            console.assert(envelope.to === this.serverKeys.publicKeyString);

                            const sharedSecret = crypto.deriveSharedSecret(this.serverKeys.privateKeyBits, decode(envelope.from));

                            if (DEBUG) {
                                // use client private key to rederive shared secret
                                const clientSharedSecret = crypto.deriveSharedSecret(decode(envelope.clientPrivateKey), this.serverKeys.publicKeyBits);
                                // check consistency with locally derived shared secret THIS SUCCEEDS
                                console.assert(uint8ArrayEquals(sharedSecret, clientSharedSecret), 'server secret should match locally computed client secret');
                                // FAIL - the locally derived client secret is different than the one the client sends
                                console.assert(uint8ArrayEquals(decode(envelope.sharedSecret), clientSharedSecret), 'client secret should match locally computed client secret');
                            }

                            if (encode(sharedSecret) !== envelope.sharedSecret) {
                                const client = {
                                    publicKey: envelope.from,
                                    privateKey: envelope.clientPrivateKey,
                                    sharedSecret: envelope.sharedSecret,
                                }
                                const server = {
                                    publicKey: this.serverKeys.publicKeyString,
                                    privateKey: this.serverKeys.privateKeyString,
                                    sharedSecret: encode(sharedSecret),
                                }
                                reject({client, server});
                                return;
                                //throw new Error(`shared secrets don't match \n${encode(sharedSecret)} \n${envelope.sharedSecret}`);
                            }
                            console.debug("3a. Server derives shared secret ", encode(sharedSecret), envelope.sharedSecret);

                            const nonceMatches = (encode(nonceBits) === envelope.nonce);
                            if (!nonceMatches) {
                                reject(new Error(`nonces don't match: server, client \n${encode(nonceBits)} \n${envelope.nonce} `));
                                return;
                            }

                            // decrypt the test message and check equality
                            const clearMessageBits = crypto.decryptMessage(envelope, sharedSecret, false);
                            const clearMessageString = bitsToString(clearMessageBits);
                            const messageMatches = clearMessageString === expectedMessageString;


                            if (nonceMatches && messageMatches) {
                                console.debug("4a. Server send client success");
                                this.isRegistered = true;
                                this.publicKey = envelope.publicKey;
                                this.socket.onclose = this?.onclose;
                                this.socket.onerror = this?.onerror;
                                this.setupSecureMessageHandling();
                                this.socket.send(JSON.stringify({type: "REGISTER_SUCCESS"}));
                                resolve(this);
                            } else {
                                console.debug("4b. Server send client failure");
                                this.socket.send(JSON.stringify({
                                    type: "REGISTER_FAILURE",
                                    reason: "Invalid ciphertext"
                                }));
                                reject(new Error("Registration failed: Invalid ciphertext"));
                                return;
                            }
                            break;

                        default:
                            this.socket.send(JSON.stringify({
                                type: "REGISTER_FAILURE",
                                reason: "Unexpected message type" + envelope.type
                            }));
                            throw new Error("Registration failed: Unexpected message type: " + envelope.type);
                    }
                } catch (ex) {
                    console.error(ex);
                    reject(ex);
                }
            };

            // 2. Any close, error, or timeout is a registration failure.
            this.socket.onclose = () =>  reject(new Error("Connection closed during registration"));
            this.socket.onerror = (error) =>  reject(new Error(`Connection error: ${error.message || error}`));
            setTimeout(() => {
                if (this.isRegistered) return;
                this.socket.onmessage = null;
                reject(new Error("Registration timed out"));
            }, registrationTimeout);

            // 3. Kick off the registration process with a Challenge
            console.log(this.serverKeys);
            const challengeEnvelope = {
                type: 'CHALLENGE',
                from: this.serverKeys.publicKeyString,
                nonce: encode(nonceBits),
                challengeText: expectedMessageString,
            }
            if (DEBUG){
                challengeEnvelope.serverPrivateKey = this.serverKeys.privateKeyString;
            }
            console.log("1. Server send challengeEnvelope", challengeEnvelope);
            this.socket.send(JSON.stringify(challengeEnvelope));
        });
    }

    isValidChallengeResponse(envelope, expectedMessageString, serverNonceBits){
        // make sure the client used the right nonce
        const clientNonceBits = decode(envelope.nonce);
        const nonceMatches = (clientNonceBits !== serverNonceBits);
        if (!nonceMatches) return false;

        // decrypt what they sent
        const clientPublicKeyBits = decode(envelope.from);
        const sharedSecret = crypto.deriveSharedSecret(this.serverKeys.privateKeyBits, clientPublicKeyBits);
        const clearMessageBits = crypto.decryptMessage(envelope, sharedSecret, false);
        const clearMessageString = bitsToString(clearMessageBits);

        // the key is valid if we get what we expect
        return (clearMessageString === expectedMessageString);
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


