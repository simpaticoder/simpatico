import * as crypto from "./crypto.js";
const {encode, decode, stringToBits, bitsToString, uint8ArrayEquals} = crypto;

// Debugging - see secure.socket.md for coordination instructions
const DEBUG = false;
const testData = (() => {
    let clientKeys = {
        "name": "clientKeys",
        "publicKeyString": "u3I5RMw41QpBtvUcogAZc_N5h3YCTHVWIJV-wlNXgFU",
        "privateKeyString": "eHkjk5vg6qo6BynuTPTnnSHtFlR8hX8gvuzWvyAiztk"
    }
    let serverKeys = {
        "name": "serverKeys",
        "publicKeyString": "KOiZFcEslzcVp65XDvZD0Kia7VMFGgtBDq7QFKqDhEE",
        "privateKeyString": "kpfW8bQ24Ez8s2ABsLRvPEy_30G-IvqOQ2Y6kRHpjXg"
    }
    let sharedSecrets = {
        client: "8ue5-nNYXjYRHYOZGXT8wA2l0VsAs0yWltdEr8pe5Ks",
        server: "8ue5-nNYXjYRHYOZGXT8wA2l0VsAs0yWltdEr8pe5Ks",
    }
    let nonceString = "XKBo0GHfKEXBYp_HPdWVX6keNbzIOZ2f";
    let messageString = "Fri Aug 29 2025 15:19:31 GMT-0400 (Eastern Daylight Time)";

    clientKeys.publicKeyBits = decode(clientKeys.publicKeyString);
    clientKeys.privateKeyBits = decode(clientKeys.privateKeyString);
    serverKeys.publicKeyBits = decode(serverKeys.publicKeyString);
    serverKeys.privateKeyBits = decode(serverKeys.privateKeyString);
    sharedSecrets.clientBits = decode(sharedSecrets.client);
    sharedSecrets.serverBits = decode(sharedSecrets.server);

    return {
        clientKeys, serverKeys, sharedSecrets,
        nonceString, nonceBits: decode(nonceString), messageString
    };
})();
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
        if (DEBUG) serverKeys = testData.serverKeys; // static server keys
        const instance = new SecureWebSocketServer(socket, serverKeys, onsecuremessage);
        await instance.initialize(registrationTimeout);
        return instance;
    }

    async initialize(registrationTimeout) {
        const nonceBits = DEBUG ? testData.nonceBits : crypto.getRandomValues();
        const expectedMessageString = DEBUG ? testData.messageString : 'Simpatico Welcomes You! ' + new Date();

        await new Promise((resolve, reject) => {
            this.socket.onmessage = (event) => {
                try {
                    const envelope = JSON.parse(event.data);
                    switch (envelope.type) {
                        case "CHALLENGE_RESPONSE":
                            console.debug("3. Server receive challengeResponseEnvelope", envelope);
                            if (DEBUG) {
                                console.assert(envelope.from === testData.clientKeys.publicKeyString);
                                console.assert(envelope.to === this.serverKeys.publicKeyString);
                            }
                            const sharedSecret = crypto.deriveSharedSecret(this.serverKeys.privateKeyBits, decode(envelope.from));

                            if (DEBUG) {
                                console.assert(uint8ArrayEquals(sharedSecret, testData.sharedSecrets.serverBits));
                            }

                            if (encode(sharedSecret) !== envelope.sharedSecret) {
                                reject({
                                    client: envelope.from,
                                    server: this.serverKeys.publicKeyString,
                                    clientSharedSecret: envelope.sharedSecret,
                                    serverSharedSecret: encode(sharedSecret),
                                });
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

                            if (DEBUG) {
                                console.assert(testData.messageString === clearMessageString)
                            }

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


