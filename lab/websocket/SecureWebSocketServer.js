import * as crypto from "./crypto.js";
const {encode, decode, stringToBits, bitsToString, uint8ArrayEquals} = crypto;

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
        try{
            await this.handleRegistration(registrationTimeout);
        } catch (error){
            this.cleanup(error);
        }

    }

    cleanup(error) {
        console.error(error);
        this.isRegistered = false;
        if (this.socket.readyState !== WebSocket.CLOSED) {
            this.socket.send(JSON.stringify({
                type: "REGISTER_FAILURE",
                error: error.message,
            }));
            this.socket.close();
        }
        this.socket.onmessage = null;
        this.socket.onclose = null;
        this.socket.onerror = null;
    }

    async handleRegistration(registrationTimeout){
        const nonceBits = crypto.getRandomValues();
        const expectedMessageString =  'Simpatico Welcomes You! ' + new Date();

        return new Promise((resolve, reject) => {

            const timeoutId = setTimeout(() => {
                if (!this.isRegistered) reject(new Error("Registration timed out"));
            }, registrationTimeout);

            this.socket.onmessage = (event) => {
                const envelope = JSON.parse(event.data);
                switch (envelope.type) {
                    case "CHALLENGE_RESPONSE":
                        if (this.isValidChallengeResponse(envelope,expectedMessageString, nonceBits)) {
                            //console.debug("4a. Server send client success");
                            this.isRegistered = true;
                            this.publicKey = envelope.from;
                            this.socket.onclose = this?.onclose;
                            this.socket.onerror = this?.onerror;
                            this.setupSecureMessageHandling();
                            this.socket.send(JSON.stringify({type: "REGISTER_SUCCESS"}));
                            clearTimeout(timeoutId);
                            resolve(this);
                        } else {
                            clearTimeout(timeoutId);
                            reject(new Error("Registration failed: Invalid ciphertext"));
                        }
                        break;
                    default:
                        clearTimeout(timeoutId);
                        reject(new Error("Registration failed: Unexpected message type: " + envelope.type));
                }
            };

            // 2. Any close, error, or timeout is a registration failure.
            this.socket.onclose = () => {
                clearTimeout(timeoutId);
                reject(new Error("Connection closed during registration"));
            };

            this.socket.onerror = (error) => {
                clearTimeout(timeoutId);
                reject(new Error(`Connection error during registration: ${error.message || error}`));
            };

            // 3. Kick off the registration process with a Challenge
            const challengeEnvelope = {
                type: 'CHALLENGE',
                from: this.serverKeys.publicKeyString,
                nonce: encode(nonceBits),
                challengeText: expectedMessageString,
            }
            this.socket.send(JSON.stringify(challengeEnvelope));
            //console.log("1. Server send challengeEnvelope", challengeEnvelope);
        });
    }

    isValidChallengeResponse(envelope, expectedMessageString, nonceBits){
        const serverPublicKeyMatches = envelope.to === this.serverKeys.publicKeyString;

        const sharedSecret = crypto.deriveSharedSecret(this.serverKeys.privateKeyBits, decode(envelope.from));
        const sharedSecretMatches = encode(sharedSecret) !== envelope.sharedSecret
        //console.debug("3a. Server derives shared secret ", encode(sharedSecret), envelope.sharedSecret);

        const nonceMatches = (encode(nonceBits) === envelope.nonce);

        // decrypt the test message and check equality
        const clearMessageBits = crypto.decryptMessage(envelope, sharedSecret, false);
        const clearMessageString = bitsToString(clearMessageBits);
        const messageMatches = clearMessageString === expectedMessageString;
        return serverPublicKeyMatches & sharedSecretMatches & nonceMatches && messageMatches;
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


