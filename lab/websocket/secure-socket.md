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
    const {privateKeyBits, publicKeyBits} = crypto.generateEncryptionKeys('client-seed-123');
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

This is a debugging version where the keys are hardcoded. We are just testing the registration protocol, so let alice be the client and bob the server.

```js
///
import * as crypto from './crypto.js';
window.testCrypto = crypto;
import SecureWebSocketClient from './SecureWebSocketClient.js';

const {stringToBits, bitsToString, encode, decode} = crypto;

// Hard-coded user strings
let client = {
    "name": "client",
    "publicKeyString": "u3I5RMw41QpBtvUcogAZc_N5h3YCTHVWIJV-wlNXgFU",
    "privateKeyString": "eHkjk5vg6qo6BynuTPTnnSHtFlR8hX8gvuzWvyAiztk"
}
let server = {
    "name": "server",
    "publicKeyString": "KOiZFcEslzcVp65XDvZD0Kia7VMFGgtBDq7QFKqDhEE",
    "privateKeyString": "kpfW8bQ24Ez8s2ABsLRvPEy_30G-IvqOQ2Y6kRHpjXg"
}
let sharedSecrets = {
    client: "8ue5-nNYXjYRHYOZGXT8wA2l0VsAs0yWltdEr8pe5Ks",
    server: "8ue5-nNYXjYRHYOZGXT8wA2l0VsAs0yWltdEr8pe5Ks",
}
client.publicKeyBits = decode(client.publicKeyString);
client.privateKeyBits = decode(client.privateKeyString);
server.publicKeyBits = decode(server.publicKeyString);
server.privateKeyBits = decode(server.privateKeyString);

const sharedSecret = crypto.deriveSharedSecret(client.privateKeyBits, server.publicKeyBits);
console.log(encode(sharedSecret)); // hard code it.

let socket = SecureWebSocketClient.create(client, message => {
    console.log(message);
});


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

## Troubleshooting

Given the mismatching shared secret, one thing to try was to hard-code  key strings and 
check against them during the protocol run. 
My thinking is that if this worked, then it's a transport problem.
It worked. Sadly there is no good testing framework for this code, so I branched and committed these changes there. It will probably be difficult merging back to master, but so it goes.

```js
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

```


## Lessons

1. Starting with *encodings* was the surprising entry point that made this task doable. Writing small "ideal" code, while examining options, was a great way to pin down what kind of socket classes I wanted to write.
2. On a related note, crypto (and network!) code is very type-dependant and would certainly benefit from TypeScript. To mitigate this problem I've taken to using a relatively disciplined style and naming convention with variables.
3. Writing socket wrappers was probably the wrong approach for an MVP. I would have been better off using socket.io which is a mature and well-tested library. Being slow or even bloated on the client side (although it is not; the client is 14kb of code, which is a lot for simpatico standards, but small in every other context.) Other methods (like socket.io, or another type-safe language compiled to WebAssembly) certainly have their drawbacks. One of which is breaking the "minimal dependency" vow I've taken for this project.
4. Probably should have implemented this protocol purely at the application level over a robust cleartext transport first, then add security on top. This neatly separates concerns. Performance or simplicity goals could be achieved later, incrementally, by forking the transport layer and refactoring more and more security functionality down into the transport layer.
5. The code *structure* is interesting, but it looks (and feels) nasty. The best idea in the socket code is to use `await new Promise(...)` to handle the transient state with temporary event handlers, and on success register new, steady state handlers. But even here I think the code could be greatly improved by a wiser use of "then()" and passing useful data to "resolve()".
6. exception handling in promises is subtle and easy to get wrong. I probably need to write a lab about error handling in promises, especially in the kind of pattern here with an async intitialization step.
7. Splitting code windows between client and server is a good way to trace network code ith your eyes in a way that doesn't require much instrumentation.
8. Testing this kind of code deserves another lab - and I'd like to take inspiration from socket.io's use of mocha and chai. 