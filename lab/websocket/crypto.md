# Encodings

The question of which encoding to use and when is a surprisingly complex topic in the context of writing a secure socket protocol.
In particular, there is an asymmetry with data that originates as uint8array and that which originates as text.
The cryptographic primitives expect everything as a uint8array.
JSON does not support uint8arrays, and requires everything to be a string for transport.
An additional factor is that websockets support permessagedeflate such that minimizing string length is not necessarily important.

x25519 keys and secrets originate as 32-bit uint8arrays.
keys must be encoded as strings for transport,
keys must be encoded as url safe strings in the client
shared secrets never need encoding. 

the message itself is a string
the plaintext string must be encoded as an uint8array for encryption (clearbits), encrypted into cipherbits, and then back into a string (ciphertext) for transport.
conversion of plaintext to uint8array is handled in the browser by built-in new TextEncoder().encode(plaintext) (and in node Buffer.from(cipherBits, 'utf-8'))
encryption is handled by nacl.
the cipherbits must be encoded to ciphertext for transport using hex or base64

Let's talk about transport first. The common way to encode binary data for transport in webapps is base64 or hex.
Base64 is shorter than hex (by 20 characters), the hex encoder code is much simpler and inherently url-safe
base64 has a url-safe variant called base64url, but the encoder code is more complex.

```js
import * as crypto from './crypto.js';

const {encode, decode, stringToBits, bitsToString} = crypto;

// Make a user and contact 
let alice = initializeUser('alice');
let bob = initializeUser('bob');
let bobContact = addContact(alice.privateKeyBits, bob.publicKeyString, 'bob');
let aliceContact = addContact(bob.privateKeyBits, alice.publicKeyString, 'alice');

console.log(alice, bob, bobContact, aliceContact);

// Work with text
let clearText1 = "hello bob";
let envelope1 = crypto.encryptMessage(alice, bobContact, clearText1, "MESSAGE", false);
let clearText2 = crypto.decryptMessage(envelope1, bobContact.sharedSecret, false);
assertEquals(clearText1, clearText2);

// Work with serializable object messages
let clearObjectMessage1 = {a: 1, b: 'hello there'};
let envelope2 = crypto.encryptMessage(alice, bobContact, clearObjectMessage1);
let clearObjectMessage2 = crypto.decryptMessage(envelope2, bobContact.sharedSecret);
assertEquals(clearObjectMessage1, clearObjectMessage2);


// Initialize public private keypairs for local user
// Signing keys are only used during socket registration.
// Encryption keys are used during the lifetime of the socket
function initializeUser(name) {
    const keys = crypto.generateEncryptionKeys();
    return {
        name,
        ...keys
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
        sharedSecret,
        sharedSecretString: encode(sharedSecret)
    }
}

// these functions are not called here, they are part of crypto.js, included only for reference.
function encryptMessage(from, to, clearString, isJSON = true) {
    clearString = isJSON ? JSON.stringify(clearString) : clearString;
    let clearBits = stringToBits(clearString);
    let nonceBits = getRandomValues();
    let cipherBits = encrypt(clearBits, nonceBits, to.sharedSecret);

    // encode the nonce and message for transport
    return {
        nonce: encode(nonceBits),
        message: encode(cipherBits)
    };
}

// these functions are not called here, they are part of crypto.js, included only for reference.
function decryptMessage(envelop, sharedSecret, isJSON = true) {
    let nonceBits = decode(envelop.nonce);
    let cipherBits = decode(envelop.message);

    let plainBits = decrypt(cipherBits, nonceBits, sharedSecret);
    let plainString = bitsToString(plainBits);

    return isJSON ? JSON.parse(plainString) : plainString;
}

```

So I think this captures the essence of the problem, and highlights roughly where the code should go. 
The user and contact code exists in the "application".
encrypt and decrypt go in crypto utilities and (probably) only get called in the securewebsocket class.
the application layer also needs access to generateKeys and deriveSharedSecret, so we'll look at that.

turns out node and the browser use different functions to do utf8 uint8array en/decoding, so lets support that.
another nice thing about this class is that we only create two TextEncoders in the browser:

```js
const Utf8Converter = (() => {
    const isNode =
        typeof process !== 'undefined' &&
        process.versions != null &&
        typeof process.versions.node === 'string';
  if (isNode) {
    return {
      stringToBits: str => Buffer.from(str, 'utf-8'),
      bitsToString: arr => Buffer.from(arr).toString('utf-8'),
    };
  } else {
    const encoder = new TextEncoder();
    const decoder = new TextDecoder('utf-8');
    return {
      stringToBits: str => encoder.encode(str),
      bitsToString: arr => decoder.decode(arr),
    };
  }
})();
const {stringToBits, bitsToString} = Utf8Converter;
```

## Troubleshooting ECDH
Node and the browser are computing a different symmetric key given two keypairs.
This problem does not occur in browser test code.
The first step, though, is to reproduce as simply as possible.
We need two fixed keypairs, hardcoded into a script in the browser, and one for node.
Hopefully this one script will do

```js
import * as crypto from './crypto.js';
const {encode, decode, stringToBits, bitsToString} = crypto;

let alice = {
    "name": "alice",
    "publicKeyString": "u3I5RMw41QpBtvUcogAZc_N5h3YCTHVWIJV-wlNXgFU",
    "privateKeyString": "eHkjk5vg6qo6BynuTPTnnSHtFlR8hX8gvuzWvyAiztk"
}

let bob = {
    "name": "bob",
    "publicKeyString": "KOiZFcEslzcVp65XDvZD0Kia7VMFGgtBDq7QFKqDhEE",
    "privateKeyString": "kpfW8bQ24Ez8s2ABsLRvPEy_30G-IvqOQ2Y6kRHpjXg"
}

let aliceSharedSecret = crypto.deriveSharedSecret(decode(alice.privateKeyString), decode(bob.publicKeyString));
let bobSharedSecret = crypto.deriveSharedSecret(decode(bob.privateKeyString), decode(alice.publicKeyString));

console.log(encode(aliceSharedSecret), encode(bobSharedSecret));
// Browser: 8ue5-nNYXjYRHYOZGXT8wA2l0VsAs0yWltdEr8pe5Ks 8ue5-nNYXjYRHYOZGXT8wA2l0VsAs0yWltdEr8pe5Ks
// Node:    8ue5-nNYXjYRHYOZGXT8wA2l0VsAs0yWltdEr8pe5Ks 8ue5-nNYXjYRHYOZGXT8wA2l0VsAs0yWltdEr8pe5Ks
```
Okay, so this test implies there aren't any differences between how the browser and node execute the library.
The next step is to temporarily override dynamic key generation in the [secure-socket lab](secure-socket.md)