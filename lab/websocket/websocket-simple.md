There are a few issues with this code (naming is inconsistent with message and packet; the structure of messages is not clear enough).
However I like the simplicity of a promise-based solution; a full FSM always seemed like overkill. It's also clearer what operations
are available at each state. I'm generally not a fan of dynamic listeners, however I like the use of a temporary handler to deal with 
registration at the beginning of the lifetime. I have mixed feelings about an async constructor, and the need to pass the callback into 
the constructor rather than after construction, however the dynamic nature of this class makes that convenient.

Note that this code is currently not running. Also note that a real encrypt/decrypt stateless function pair may be quite compute intensive,
based on ec25519 keys requiring for each message (!) a) deriving the x25519 keys for sender/reciever public keys, b) computing the DH shared secret, and c) using that shared secret to do the decryption. In a real implementation it would make sense to give this socket access to a map of (remote) public keys to precomputed DH secrets, and in a form that can be persisted and rehydrated on startup. Note that the shared secrets are precisely as sensitive as the private key, so any steps taken to protect it (like password encrypted at rest) should apply to them, too.

As a matter of taste, the constructor is too long. However having ALL the initialization logic in one place compensates for this; in addition, factoring out each step into "private" methods is quite straight-forward, if that's desirable. Also note that some may object to the use of the simpler but less flexible 'onX' form of callbacks rather than "addListener(x,cb)" style, but this both keeps the code simpler and also omits flexibility we don't need, and to some extent signals that we're going to be overwriting the socket's listeners. Eventually I'd like to pass in the websocket as a parameter, to make testing easier, as well as suport injection of a logger (although this can also be handled by the caller). We may also want to expose an "onclose" callback that would basically forward from the underlying socket. In addition we may want to define a "graceful close" protocol to distinguish from unintentional closes, but it's not clear that's necessary yet. Another useful thing would be, along with passing the socket in, to build a mock websocket that supports usage by both client and server code, to facilitate testing. Note also that we will want a server version of this class that handles the other side of connection and registration steps, with the option of validating secure messaging steps (signatures, throttle, etc). 
```js
/**
 * SecureWebSocket - A WebSocket wrapper that provides end-to-end encryption
 * using asymmetric cryptography (public/private key pairs)
 */
class SecureWebSocket {
    /**
     * Creates a new secure WebSocket connection
     * 
     * @param {string} publicKey - Your public key
     * @param {string} privateKey - Your private key (keep this secret!)
     * @param {string} endpoint - WebSocket server endpoint (defaults to secure messaging server)
     * @param {function} onmessage - Callback that recieves (err, decrypted_message).
     * @returns {Promise<SecureWebSocket>} - A promise that resolves to the secure connection
     */
    constructor(publicKey, privateKey, endpoint = "wss://secure-messaging-server.example.com", onmessage) {
        return (async () => {
            // Validate required parameters
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
            this.endpoint = endpoint;
            this.onmessage = onmessage;

            try {
                this.isRegistered = false;
                this.socket = new WebSocket(endpoint);

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
                    const timeoutId = setTimeout(() => {
                        this.socket.onmessage = null;
                        reject(new Error("Registration timed out"));
                    }, 5000);
                });

                // Step 3: If we got this far, we can send() and receive messages with onmessage
                socket.onmessage = packet => {
                    try {
                        const isValid = crypto.verify(packet.content, packet.signature, packet.from);
                        if (!isValid){
                            this.onmessage(new Error("Failed to validate message:", {cause: packet}));
                            return;
                        }

                        const decryptedContent = crypto.decrypt(packet.from, this.privatekey, packet.content);
                        parsedContent = JSON.parse(decryptedContent);
                        this.onmessage(null, {
                            from: packet.from,
                            content: parsedContent,
                            timestamp: packet.timestamp
                        });
                    } catch (error) {
                        this.onmessage(new Error("Failed to decrypt message:", {cause: {error, packet}}));
                    }
                };
                socket.onerror = err => this.onmessage(err);
                
                return this;
                
            } catch (error) {
                throw new Error(`Failed to create secure connection: ${error.message}`);
            }
        })();
    }

    /**
     * Send an encrypted message to another user
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
            const signature = sign(encryptedContent);

            // Prepare the message packet
            const packet = {
                type: "MESSAGE",
                from: this.publicKey,
                to: recipientKey,
                content: encryptedContent,
                signature: signature,
                timestamp: Date.now()
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

async function runDemo(){
    let a = 1;
    let connection;
    try{
        connection = await SecureWebSocket(publicKey, privateKey, endpoint, (err, cleartext) =>{
            // do something with inbound messages
        });
        connection.onclose = ({}) => {
            // handle closures
        }
    }
    catch (e) {
        // problem creating the socket.
    }
    connection.send({to: publicKey, content: 'plaintext'});
}
```