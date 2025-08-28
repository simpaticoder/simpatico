# Secure WebSocket

A secure websocket encrypts all messages such that the server cannot read them.
The server in this scenario verifies clients and routes messages between connected clients.

  1. The client creates a public key on startup and saves it for future use.
  2. The client creates an ordinary websocket and waits for a challenge.
  3. The server accepts the ordinary websocket connection, and issues a challenge to the client.
  4. The client responds to the challenge successfully and can now send messages to other public keys in a secure fashion. 

The server challenge is a server public key and clear-text that the client should encrypt proprely

To implement this protocol we will first need to select an encryption library and decide on its usage.
The built-in browser cryptography primitives are insufficient, so we use nacl.js, based on libsodium.
We will use the ws node library on the server side, but keep an eye on uSocket as an alternative (it is much faster but also cannot support live cert reloading).
We will assume that all messages are JSON.

It's important to familiarize with the "fixed" or "given" APIs that we are starting with. 
There are three: 
  1. The nacl.js API.
  2. The browser websocket API.
  3. The node ws API.
  4. The secure websocket protocol
  5. Router logic
  6. Client logic


## nacl.js API

After exercising nacl.js in the [nacl lab](nacl.md) lab, several decisions:

 1. Use Diffie-Helman key exchange. This limits our choice of algorithms and so our choice of keys. We pick X25519 algo for Diffie-Helman.
 2. Because the keys are small compared to RSA, the exciting prospect of using them directly as a URL becomes possible using base64url
 3. Our protocol will define "publicKey" as a base64url encoded string of the Uint8Array nacl.js expects.
 5. The native representation of X25519 keys is Uint8Array and we transport using base64url.

> Interestingly there is a [library for lzma compression of base64 encoded data](https://gist.github.com/loilo/92220c23567d6ed085a28f2c3e84e311)
However this is probably unnecessary if using `{perMessageDeflate: true}` as an option to `ws`.

> You may come to simpatico.io but your canonical "location" is something like. simpatico.io/<base64url 32-bits>

## Websocket API

We pick the basic browser api and node ws via the [websocket lab](websocket.md).
The client naturally prefers a SecureWebSocketClient class that replaces WebSocket entirely, whereas the server wants to pass in the websocket.
The implementation is very similar but *complimentary* in the sense they implement both sides of the same protocol.
This requires two separate classes, SecureWebSocketServer and a SecureWebSocketClient, although they can and should share logic particularly around nacl.js via crypto.js.
Interesting to note that websocket supports individual message compression using perMessageDeflate header during protocol handshake (and is supported by `ws`)
See https://websockets.readthedocs.io/en/stable/topics/compression.html We'll leave that alone for now.

### Registration Protocol implementation
The simplest possible way to write these classes is to register a temporary, transient onmessage handler, then switch to a steady-state one after registration is complete.
Within that handler simply use a switch statement as in [SecureWebSocketClient.js](ClientSecureWebSocket.js). 
(One good alternative is to use a sequence of await statements). The rest of the client code handles decryption behind an onmessage proxy, and encryption behind a send() proxy.

```js
/// const data = JSON.parse(event.data);

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

Let's try out `SecureWebSocketClient`. This is an extension of the [crypto lab](crypto.md).
```js
import * as crypto from './crypto.js';
import SecureWebSocketClient from './SecureWebSocketClient.js';

const {stringToBits, bitsToString, encode, decode} = crypto;

// Make a user and contact
let alice = initializeUser('alice');
let bob = initializeUser('bob');
let bobContact = addContact(alice.privateKeyBits, bob.publicKeyString, 'bob');
alice.contacts = {};
alice.contacts[bob.publicKeyString] = bob;

let socket = SecureWebSocketClient.create(alice, message => {
    console.log(message);
});

function initializeUser(name) {
    const {privateKeyBits, publicKeyBits} = crypto.generateEncryptionKeys();
    
    return {
        name,
        publicKeyBits: publicKeyBits,
        publicKeyString: encode(publicKeyBits),
        privateKeyBits: publicKeyBits,
        privateKeyString: encode(privateKeyBits),
    }
}

// Add a contact and pre-compute shared secret
function addContact(fromPrivateKeyBits, toPublicKeyString,  name) {
    const toPublicKeyBits = decode(toPublicKeyString);
    const sharedSecret = crypto.deriveSharedSecret(fromPrivateKeyBits, toPublicKeyBits);
    return {
        name,
        publicKeyString: toPublicKeyString,
        publicKeyBits: toPublicKeyBits,
        sharedSecret
    }
}

```