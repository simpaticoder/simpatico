# WebCrypto

In recent months [WebCrypto](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) has gained X25519 asymmetric functions, and so has node 24+.

Upside:
1. probably very fast, 
2. removes a dependency.

Downside:
1. Browser support is still spotty and will probably be so for a ~1 year as people upgrade
2. Subtle.Crypto *requires* tls for non-localhost domains (which is probably good)
3. The API itself is quite clunky, and spreads "async/await" throughout the code.

Here is a test to see if this browser supports it.
```js
crypto.subtle.generateKey(
    { name: "X25519", namedCurve: "X25519" },
    true,
    ["deriveKey", "deriveBits"]
).then(() => console.log("X25519 supported"))
```

Here is the [crypto lab](crypto.md) adapted for WebCrypto:
```js
import * as crypto from './webcrypto.js';

const {encode, decode, stringToBits, bitsToString} = crypto;

// Make a user and contact 
let alice = await initializeUser('alice');
let bob = await initializeUser('bob');
console.info(alice, bob);
let bobContact = await addContact(alice.privateKey, bob.publicKeyString, 'bob');

// Work with text
let clearText1 = "hello bob";
let envelope1 = await encryptMessage(alice, bobContact, clearText1, "MESSAGE", false);
console.info(envelope1)
let clearText2 = await decryptMessage(envelope1, bobContact.symmetricKey, false);
assertEquals(clearText1, clearText2);

// Work with serializable object messages
let clearObjectMessage1 = {a: 1, b: 'hello there'};
let envelope2 = await encryptMessage(alice, bobContact, clearObjectMessage1);
let clearObjectMessage2 = await decryptMessage(envelope2, bobContact.symmetricKey);
assertEquals(clearObjectMessage1, clearObjectMessage2);


// Initialize public private keypairs for local user
// Signing keys are only used during socket registration.
// Encryption keys are used during the lifetime of the socket
async function initializeUser(name) {
    const keys = await crypto.generateEncryptionKeys();
    return {
        name,
        ...keys
    }
}

// Add a contact and pre-compute shared secret
async function addContact(fromPrivateKey, toPublicKeyString, name) {
    const toPublicKey = await crypto.importPublicKey(decode(toPublicKeyString));
    const symmetricKey = await crypto.deriveSymmetricKey(fromPrivateKey, toPublicKey);
    return {
        name,
        publicKeyString: toPublicKeyString,
        publicKey: toPublicKey,
        symmetricKey
    }
}

// these functions are not called here, they are part of crypto.js, included only for reference.
async function encryptMessage(from, to, clearString, type="MESSAGE", isJSON = true) {
    clearString = isJSON ? JSON.stringify(clearString) : clearString;
    let clearBits = stringToBits(clearString);
    let nonceBits = crypto.getRandomValues();
    let cipherBits = await crypto.encrypt(clearBits, nonceBits, to.symmetricKey);

    return {
        type,
        from: from.publicKeyString,
        to: to.publicKeyString,
        nonce: encode(nonceBits),
        message: encode(cipherBits)
    };
}

// these functions are not called here, they are part of crypto.js, included only for reference.
async function decryptMessage(envelop, symmetricKey, isJSON = true) {
    let nonceBits = decode(envelop.nonce);
    let cipherBits = decode(envelop.message);

    let plainBits = await crypto.decrypt(cipherBits, nonceBits, symmetricKey);
    let plainString = bitsToString(plainBits);

    return isJSON ? JSON.parse(plainString) : plainString;
}

```
