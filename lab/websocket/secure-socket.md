# Secure WebSocket

A secure websocket encrypts all messages such that the server cannot read them.
The server in this scenario verifies clients and routes messages between connected clients.

  1. The client creates a public key on startup and saves it for future use.
  2. The client creates an ordinary websocket and waits for a challenge.
  3. The server accepts the ordinary websocket, and issues a challenge to the client.
  4. The client responds to the challenge and can now send messages to other public keys in a secure fashion. 

The asymmetry in usage comes in two ways. 
The client creates a websocket, whereas the server listens for a new connection and application code is passed the socket.
The client initiates the registration protocol, and the server waits for that initiation.

To implement this protocol we will first need to select an encryption library and decide on its usage.
The built-in browser cryptography primitives are insufficient, so we use nacl.js, based on libsodium.
We will use the ws node library on the server side, but keep an eye on uSocket as an alternative (it is much faster but also cannot support live cert reloading).
We will assume that all messages are JSON encoded.
We will further attempt to support the browser native websocket api with our new type of socket, making it a facade.

It's important to familiarize with the "fixed" or "given" APIs that we are starting with. 
There are three: 
  1. The nacl.js API.
  2. The browser websocket API.
  3. The node ws API.
  4. The secure websocket protocol
  5. Router logic


## nacl.js API

After exercising nacl.js in the [crypto lab](../crypto.md) lab, several decisions:

 1. Use Diffie-Helman key exchange. This limits our choice of algorithms and so our choice of keys. We pick Ed25519 algorithm and the related X25519 algo for Diffie-Helman.
 2. Because the keys are small compared to RSA, the exciting prospect of using them directly as a URL becomes possible using something like a hex string.
 3. Our protocol will define "public key" as the hex-encoded string representation of the Uint8Array nacl.js expects.
 4. There are two pairs of keypairs, one for signing and one for encrypting. We pick the encrypting public key as a unique process identifier.

> You may come to simpatico.io but your canonical "location" is something like. simpatico.io/7374d29278c1e422d21bccd35fbad464152e5e9832857e827e246a51c05f0177 

## Websocket API

We pick the basic browser api and node ws via the [simple-websocket lab](simple-websocket.md).
The client naturally prefers a ClientSecureWebSocket class that replaces WebSocket entirely, whereas the server wants to pass in the websocket.
The implementation is very similar but *complimentary* in the sense they implement both sides of the same protocol.
This requires two separate classes, ServerSecureWebSocket and a ClientSecureWebSocket, although they can and should share logic particularly around nacl.js.

### Registration Protocol implementation
The simplest possible way to write these classes is to register a temporary, transient onmessage handler, then switch to a steady-state one after registration is complete.
Within that handler simply use a switch statement as in [ClientSecureWebSocket.js](ClientSecureWebSocket.js). 
(One good alternative is to use a sequence of await statements). The rest of the client code handles decryption behind an onmessage proxy, and encryption behind a send() proxy.

```js
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
```



```js

```


The server has a similar block, although it's logic is longer so it uses function calls:

```js

```
### Testing