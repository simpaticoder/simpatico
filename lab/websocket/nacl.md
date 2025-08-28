# This example demonstrates:
1. Generating an Ed25519 keypair for signing
2. ~~Deriving an X25519 keypair from the Ed25519 key with ed2curve~~
3. Generate an X25519 keypair for encryption
4. Perform a Diffie-Hellman key exchange
5. Usie the shared secret to encrypt/decrypt a message

> Note: This example ignores the `subtle crypto API` and uses the `tweetnacl-js` library.

This is an exercise of the tweetnacl library, learning the basics with minimal ceremony.
For a higher level, more realistic use-case, see [crypto.md](crypto.md)
```html


<div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: monospace;">
  <h1>Ed25519/X25519 Secure Communication Demo</h1>
  <button id="run-demo">Run Demonstration</button>
  <pre id="message-container" style="background: #f4f4f4; color: #1a3b5d; padding: 15px; margin-top: 20px; height: 500px; overflow: auto; border: 1px solid #ddd;"></pre>
</div>
```

```js
import nacl from '/vendor/nacl.js';

/**
 * Alice and Bob's communication workflow with correct key generation
 */
async function secureCommunicationDemo() {
    const messageContainer = document.getElementById('message-container');

    logMessage('Starting secure communication demo...');
    
    // Step 1. Note that subtle.crypto supports this operation
    logMessage('\nGenerating Ed25519 keypairs for Alice and Bob (for signatures)...');

    const aliceEd25519KeyPair = nacl.sign.keyPair();
    logMessage('Alice Ed25519 Public Key: ' + uint8ArrayToHex(aliceEd25519KeyPair.publicKey));

    const bobEd25519KeyPair = nacl.sign.keyPair();
    logMessage('Bob Ed25519 Public Key: ' + uint8ArrayToHex(bobEd25519KeyPair.publicKey));

    // Step 2. Note that subtle.crypto does NOT currently support deriving x25519 from ed25519, which is why we need tweetnacl
    logMessage('\nGenerating X25519 keypairs for Alice and Bob (for encryption)...');

    const aliceX25519KeyPair = nacl.box.keyPair();
    logMessage('Alice X25519 Public Key: ' + uint8ArrayToHex(aliceX25519KeyPair.publicKey));
    logMessage('Alice X25519 Secret Key: ' + uint8ArrayToHex(aliceX25519KeyPair.secretKey));

    const bobX25519KeyPair = nacl.box.keyPair();
    logMessage('Bob X25519 Public Key: ' + uint8ArrayToHex(bobX25519KeyPair.publicKey));
    logMessage('Bob X25519 Secret Key: ' + uint8ArrayToHex(bobX25519KeyPair.secretKey));

    // Step 3: Perform Diffie-Hellman key exchange
    logMessage('\nPerforming Diffie-Hellman key exchange...');

    // Alice computes the shared secret using her secret key and Bob's public key
    const aliceSharedSecret = nacl.scalarMult(
        aliceX25519KeyPair.secretKey,
        bobX25519KeyPair.publicKey
    );
    logMessage('Alice computed shared secret: ' + uint8ArrayToHex(aliceSharedSecret));

    // Bob computes the shared secret using his secret key and Alice's public key
    const bobSharedSecret = nacl.scalarMult(
        bobX25519KeyPair.secretKey,
        aliceX25519KeyPair.publicKey
    );
    logMessage('Bob computed shared secret: ' + uint8ArrayToHex(bobSharedSecret));

    // Verify that both computed the same shared secret
    const secretsMatch = compareUint8Arrays(aliceSharedSecret, bobSharedSecret);
    logMessage('Shared secrets match: ' + secretsMatch);

    if (!secretsMatch) {
        logMessage('Error: Diffie-Hellman key exchange failed!');
        return;
    }

    // Step 4: Alice encrypts a message to Bob
    logMessage('\nAlice is encrypting a message for Bob...');

    const originalMessage = 'Hello Bob! This is a secret message from Alice.';
    logMessage('Original message: ' + originalMessage);

    // Generate a nonce for encryption
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    logMessage('Generated nonce: ' + uint8ArrayToHex(nonce));

    // Convert the message to Uint8Array
    const messageUint8 = new TextEncoder().encode(originalMessage);

    // Encrypt the message using the shared secret
    const encryptedMessage = nacl.secretbox(messageUint8, nonce, aliceSharedSecret);

    logMessage('Encrypted message: ' + uint8ArrayToHex(encryptedMessage));

    // Step 5: Alice signs the encrypted message with her Ed25519 key
    const signature = nacl.sign.detached(encryptedMessage, aliceEd25519KeyPair.secretKey);
    logMessage('Signature: ' + uint8ArrayToHex(signature));

    // Step 6: Alice sends the encrypted message, nonce, and signature to Bob
    logMessage('\nTransmitting encrypted message, nonce, and signature to Bob...');

    // Step 7: Bob verifies the signature using Alice's public key
    logMessage('\nBob is verifying the signature...');
    const signatureValid = nacl.sign.detached.verify(
        encryptedMessage,
        signature,
        aliceEd25519KeyPair.publicKey
    );

    logMessage('Signature valid: ' + signatureValid);

    if (!signatureValid) {
        logMessage('Error: Signature verification failed!');
        return;
    }

    // Step 8: Bob decrypts the message using the shared secret
    logMessage('\nBob is decrypting the message...');

    const decryptedMessage = nacl.secretbox.open(encryptedMessage, nonce, bobSharedSecret);

    if (!decryptedMessage) {
        logMessage('Error: Decryption failed!');
        return;
    }

    const decryptedText = new TextDecoder().decode(decryptedMessage);
    logMessage('Decrypted message: ' + decryptedText);

    logMessage('\nSecure communication completed successfully!');
}

/**
 * Helper function to convert Uint8Array to hex string
 */
function uint8ArrayToHex(uint8Array) {
    return Array.from(uint8Array)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        //.substring(0, 32) + '...'; // Truncate for display
}

/**
 * Helper function to compare two Uint8Arrays
 */
function compareUint8Arrays(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

/**
 * Helper function to log messages to the UI
 */
function logMessage(message) {
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageContainer.appendChild(messageElement);
    }
    console.log(message);
}

// Add event listener
document.getElementById('run-demo').addEventListener('click', secureCommunicationDemo);
```

The actual message passed between them might look something like this:

```js
const msg = {
  "timestamp": 1712767452,   // Unix timestamp when message was created
  "version": "1.0",          // Protocol version for future compatibility
  "payload": {
    "ciphertext": "base64EncodedEncryptedMessageString...", // The encrypted message
    "nonce":      "base64EncodedNonceString...",            // The nonce used for encryption
    "signature":  "base64EncodedSignatureString..."         // Ed25519 signature of the ciphertext
  },
  "publicKeys": {
    "signing":    "base64EncodedEd25519PublicKey...",        // Alice's Ed25519 public key
    "encryption": "base64EncodedX25519PublicKey...",         // Alice's X25519 public key?? bob can derive it from ed25519
    "recipient":  "base64EncodedEd25519PublicKey..."         // Bob's Ed25519 public key
  }
}
```