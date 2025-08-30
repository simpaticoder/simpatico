import nacl from '../../vendor/nacl.js';

/**
 * Multi-Format Encoding Library
 * Supports encoding and decoding Uint8Array to/from various formats:
 * - Base64 URL-safe (RFC 4648 Section 5)
 * - Isomorphic UTF-8 utility
 */
const Utf8Converter = (() => {
    const isNode =
        typeof process !== 'undefined' &&
        process.versions != null &&
        typeof process.versions.node === 'string';
    if (isNode) {
        return {
            stringToBits: str => new Uint8Array(Buffer.from(str, 'utf-8')),
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

const base64url = {
    encode(bytes) {
        if (!(bytes instanceof Uint8Array)) {
            throw new TypeError('Input must be a Uint8Array');
        }

        // Convert to binary string
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }

        // Use built-in btoa and convert to URL-safe
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, ''); // Remove padding
    },

    decode(str) {
        if (typeof str !== 'string') {
            throw new TypeError('Input must be a string');
        }

        // Convert from URL-safe to standard base64
        str = str.replace(/-/g, '+').replace(/_/g, '/');

        // Add padding if needed
        while (str.length % 4) {
            str += '=';
        }

        try {
            const binary = atob(str);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return bytes;
        } catch (e) {
            throw new Error('Invalid Base64 URL-safe string');
        }
    }
};

const {stringToBits, bitsToString} = Utf8Converter;
const {encode, decode} = base64url;

function uint8ArrayEquals(arr1, arr2) {
    if (arr1.length !== arr2.length) return false;
    for (let i = 0; i < arr1.length; i++) {
        if (arr1[i] !== arr2[i]) return false;
    }
    return true;
}

function getRandomValues(bits= nacl.secretbox.nonceLength ){
    return nacl.randomBytes(bits)
}

// seeded generation is useful for testing
function generateEncryptionKeys(seed) {
    let keyPair;
    if (seed) {
        // Ensure exactly 32 bytes for the secret key
        let seedBytes;
        if (typeof seed === 'string') {
            // Hash the string to get consistent 32 bytes
            const fullSeed = stringToBits(seed.padEnd(32, '0')); // Pad if needed
            seedBytes = new Uint8Array(32);
            for (let i = 0; i < 32; i++) {
                seedBytes[i] = fullSeed[i % fullSeed.length];
            }
        } else {
            // Ensure numeric seed becomes exactly 32 bytes
            seedBytes = new Uint8Array(32);
            seedBytes.fill(seed & 0xFF); // Use only the low byte
        }

        console.log("Seed bytes length:", seedBytes.length); // Should be 32
        keyPair = nacl.box.keyPair.fromSecretKey(seedBytes);
    } else {
        keyPair = nacl.box.keyPair();
    }

    return {
        publicKeyBits: keyPair.publicKey,
        publicKeyString: encode(keyPair.publicKey),
        privateKeyBits: keyPair.secretKey,
        privateKeyString: encode(keyPair.secretKey)
    };
}
function deriveSharedSecret(privateKeyBits, publicKeyBits){
    return nacl.box.before(publicKeyBits, privateKeyBits);
}

function encrypt(clearBits, nonceBits, sharedSecretBits){
    return nacl.secretbox(clearBits, nonceBits, sharedSecretBits);
}

function decrypt(cipherBits, nonceBits, sharedSecretBits){
    return nacl.secretbox.open(cipherBits, nonceBits, sharedSecretBits);
}

// We encrypt the message and build an envelope around it. Final stringify is left for the caller.
function encryptMessage(from, to, clearMessage, type="MESSAGE", isJSON = true, nonceBits=getRandomValues()) {
    clearMessage = isJSON ? JSON.stringify(clearMessage) : clearMessage;
    let clearBits = stringToBits(clearMessage);
    let cipherBits = encrypt(clearBits, nonceBits, to.sharedSecret);

    return  {
        type,
        from: from.publicKeyString,
        to: to.publicKeyString,
        nonce: encode(nonceBits),
        message: encode(cipherBits)
    };
}

// Decrypt the message contained in the envelope. Initial json.parse is left for the caller.
function decryptMessage(envelope, sharedSecret, isJSON = true) {
    let nonceBits = decode(envelope.nonce);
    let cipherBits = decode(envelope.message);

    let clearBits = decrypt(cipherBits, nonceBits, sharedSecret);
    let clearString = bitsToString(clearBits);

    return isJSON ? JSON.parse(clearString) : clearString;
}


export {
    generateEncryptionKeys, deriveSharedSecret, encryptMessage, decryptMessage, getRandomValues,
    encode, decode, stringToBits, bitsToString, uint8ArrayEquals
}