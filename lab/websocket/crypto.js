import nacl from '../../vendor/nacl.js';
import {stringToBits, bitsToString, base64url} from './encoder.js';

const {encode, decode} = base64url;

function getRandomValues(bits= nacl.secretbox.nonceLength ){
    return nacl.randomBytes(bits)
}

/**
 * Generates a pair of encryption keys consisting of a public key and a private key.
 * The keys are generated using NaCl's cryptographic library and are used for secure communication.
 *
 * @return {{publicKeyBits: Uint8Array, privateKeyBits: Uint8Array}} An object containing the public and private key bits.
 */
function generateEncryptionKeys() {
    const keyPair = nacl.box.keyPair();
    return {
        publicKeyBits: keyPair.publicKey,
        privateKeyBits: keyPair.secretKey
    };
}

function deriveSharedSecret(privateKeyBits, publicKeyBits){
    return nacl.scalarMult(
        privateKeyBits,
        publicKeyBits
    );
}

function encrypt(clearBits, nonceBits, sharedSecretBits){
    return nacl.secretbox(clearBits, nonceBits, sharedSecretBits);
}

function decrypt(cipherBits, nonceBits, sharedSecretBits){
    return nacl.secretbox.open(cipherBits, nonceBits, sharedSecretBits);
}

/**
 * Encrypts a message for secure transmission between two parties.
 *
 * @param {Object} from - The sender object containing the public key.
 * @param {Object} to - The recipient object containing the public key and shared secret.
 * @param {string|Object} clearString - The message to be encrypted (can be a string or an object).
 * @param {boolean} [isJSON=true] - Indicates whether the message should be stringified as JSON before encryption.
 * @param {number} [nonceLength=32] - The length of the nonce to be generated, in bytes.
 * @return {Object} An object containing the encrypted message and associated metadata, including:
 * - `from`: Sender's public key string.
 * - `to`: Recipient's public key string.
 * - `nonce`: The encoded nonce used during encryption.
 * - `message`: The encoded encrypted message.
 */
function encryptMessage(from, to, clearString, isJSON = true) {
    clearString = isJSON ? JSON.stringify(clearString) : clearString;
    let clearBits = stringToBits(clearString);
    let nonceBits = getRandomValues();
    let cipherBits = encrypt(clearBits, nonceBits, to.sharedSecret);

    // encode the nonce and message for transport
    return {
        from: from.publicKeyString,
        to: to.publicKeyString,
        nonce: encode(nonceBits),
        message: encode(cipherBits)
    };
}

/**
 * Decrypts an encrypted message contained in the provided envelope using a shared secret.
 *
 * @param {Object} envelop - The envelope containing the encrypted data. It should have `nonce` and `message` properties.
 * @param {string} sharedSecret - The shared secret used to decrypt the message.
 * @param {boolean} [isJSON=true] - Indicates whether the decrypted message should be parsed as JSON. Defaults to true.
 * @return {(Object|string)} Returns the decrypted message as a parsed JSON object if `isJSON` is true, or as a plain string otherwise.
 */
function decryptMessage(envelop, sharedSecret, isJSON = true) {
    let nonceBits = decode(envelop.nonce);
    let cipherBits = decode(envelop.message);

    let plainBits = decrypt(cipherBits, nonceBits, sharedSecret);
    let plainString = bitsToString(plainBits);

    return isJSON ? JSON.parse(plainString) : plainString;
}

function generateSigningKeys() {
    const keyPair = nacl.sign.keyPair();
    return {
        publicSigningKeyBits: keyPair.publicKey,
        privateSigningKeyBits: keyPair.secretKey
    };
}

/**
 * Sign data with a private key
 * @returns {string} Base64 encoded signature
 * @param privateSigningKeyBits
 * @param dataBits
 */
function sign(privateSigningKeyBits, dataBits) {
    return nacl.sign.detached(dataBits, privateSigningKeyBits);
}

/**
 * Verify a signature
 * @returns {boolean} True if signature is valid
 * @param publicSigningKeyBits
 * @param signatureBits
 * @param dataBits
 */
function validateSignature(publicSigningKeyBits, signatureBits, dataBits) {
    return nacl.sign.detached.verify(dataBits, signatureBits, publicSigningKeyBits);
}

export {
    generateEncryptionKeys, deriveSharedSecret, encryptMessage, decryptMessage,
    generateSigningKeys, sign, validateSignature
}