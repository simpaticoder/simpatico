import nacl from '/vendor/nacl.js'

/**
 * ServerSecureWebSocket - A WebSocket wrapper that registers ClientSecureWebSockets in a node ws environment.
 */
export default class ServerSecureWebSocket {
    /**
     * Creates a new secure WebSocket connection for the server.
     * If registration is successful, onsecuremessage should expect to see messages of the form
     *   type: "MESSAGE",
     *   from: sender.publicKey,
     *   to: receiver.publicKey,
     *   timestamp: Date.now(),
     *   content: encryptedContent
     *
     * @param {WebSocket} socket - WebSocket connection
     * @param onsecuremessage - an event handler that gets an envelope {type,from,to,timestamp,content}
     * @param registrationTimeout - integer milliseconds to wait for registration to complete
     * @returns {Promise<ServerSecureWebSocket>} - A promise that resolves to the secure connection
     */
    constructor(socket, onsecuremessage, registrationTimeout=500) {
        this.socket = socket;
        this.onsecuremessage = onsecuremessage;
        this.isRegistered = false;

        return (async () => {
            try {
                // handle general error modes
                this.socket.onclose = () => {
                    throw new Error("Failed to establish connection");
                };

                this.socket.onerror = (error) => {
                    throw new Error(`Connection error: ${error}`);
                };

                // This is the heart of the secure websocket registration protocol, closely coupled to ClientSecureWebSocketServer
                const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
                this.socket.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    if (data.type === "CHALLENGE_RESPONSE"){
                        const {publicKey, signedNonce} = data;
                        if (this.checkNonce(publicKey, signedNonce, nonce)){
                            this.isRegistered = true;
                            this.socket.send(JSON.stringify({type: "REGISTER_SUCCESS"}));
                            this.socket.onmessage = this.onsecuremessage;
                        }
                    }
                    if (!this.isRegistered){
                        this.socket.send(JSON.stringify({type: "REGISTER_FAILURE"}));
                        this.socket.onerror("Registration failed; bad type or singed nonce not present or invalid.")
                    }
                }
                // Initiate the registration protocol
                this.socket.send(JSON.stringify({type: "CHALLENGE", nonce}));


                // Set a timeout for the registration process
                setTimeout(() => {
                    this.socket.onmessage = null;
                    reject(new Error("Registration timed out"));
                }, registrationTimeout);

            } catch (error) {
                throw new Error("Failed to create secure connection" + error.cause);
            }
        })();
    }

    /**
     * Close the connection
     */
    close() {
        this.socket.close();
        this.isRegistered = false;
    }

    checkNonce(publicKey, signedNonce, nonce) {

    }

}

