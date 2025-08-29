/**
 * Multi-Format Encoding Library (unchanged)
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
const base64url = {
    encode(bytes) {
        if (!(bytes instanceof Uint8Array)) {
            throw new TypeError('Input must be a Uint8Array');
        }
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, '');
    },
    decode(str) {
        if (typeof str !== 'string') {
            throw new TypeError('Input must be a string');
        }
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) {
            str += '=';
        }
        const binary = atob(str);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
};
const {stringToBits, bitsToString} = Utf8Converter;
const {encode, decode} = base64url;

function getRandomValues(length = 12) { // ChaCha20-Poly1305 nonce length is 12 bytes
    return crypto.getRandomValues(new Uint8Array(length));
}

// Key generation using X25519
async function generateEncryptionKeys() {
    const keyPair = await crypto.subtle.generateKey(
        { name: "X25519", namedCurve: "X25519" },
        true, // extractable, so keys can be exported if needed
        ["deriveKey", "deriveBits"]
    );
    const publicKeyBits = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey));
    const privateKeyBits = new Uint8Array(await crypto.subtle.exportKey('pkcs8', keyPair.privateKey));

    return {
        publicKey: keyPair.publicKey,               // CryptoKey object
        privateKey: keyPair.privateKey,             // CryptoKey object
        publicKeyString: encode(publicKeyBits),     // base64url string
        privateKeyString: encode(privateKeyBits)    // base64url string
    };
}

// Import keys from raw bytes/base64url-encoded strings
async function importPublicKey(publicKeyBits) {
    return await crypto.subtle.importKey(
        "raw",
        publicKeyBits,
        { name: "X25519", namedCurve: "X25519" },
        true,
        []
    );
}

async function importPrivateKey(privateKeyBits) {
    return await crypto.subtle.importKey(
        "raw",
        privateKeyBits,
        { name: "X25519", namedCurve: "X25519" },
        true,
        ["deriveKey", "deriveBits"]
    );
}


async function deriveSymmetricKey(privateKey, publicKey) {
    try {
        const sharedSecretBits = await crypto.subtle.deriveBits(
            { name: "X25519", public: publicKey },
            privateKey,
            256
        );
        const sharedSecretKey = await crypto.subtle.importKey(
            "raw",
            sharedSecretBits,
            { name: "HKDF" },
            false,
            ["deriveKey"]
        );

        // Use AES-GCM instead of ChaCha20-Poly1305 for better browser support
        const symmetricKey = await crypto.subtle.deriveKey(
            {
                name: "HKDF",
                hash: "SHA-256",
                salt: new Uint8Array(16), // 16 bytes of zeros
                info: new Uint8Array(0),  // Empty info
            },
            sharedSecretKey,
            { name: "AES-GCM", length: 256 }, // Use AES-GCM instead
            false,
            ["encrypt", "decrypt"]
        );

        return symmetricKey;
    } catch (error) {
        throw error;
    }
}
async function encrypt(clearBits, nonceBits, symmetricKey) {
    return new Uint8Array(await crypto.subtle.encrypt(
        {
            name: "AES-GCM",
            iv: nonceBits // AES-GCM uses 12-byte IV (same as ChaCha20-Poly1305 nonce)
        },
        symmetricKey,
        clearBits
    ));
}

async function decrypt(cipherBits, nonceBits, symmetricKey) {
    const clearBuffer = await crypto.subtle.decrypt(
        {
            name: "AES-GCM",
            iv: nonceBits
        },
        symmetricKey,
        cipherBits
    );
    return new Uint8Array(clearBuffer);
}

// Encrypt the message and build an envelope
async function encryptMessage(from, to, clearMessage, type = "MESSAGE", isJSON = true) {
    clearMessage = isJSON ? JSON.stringify(clearMessage) : clearMessage;
    const clearBits = stringToBits(clearMessage);
    const nonceBits = getRandomValues();
    const cipherBits = await encrypt(clearBits, nonceBits, to.symmetricKey);

    return {
        type,
        from: from.publicKeyString,
        to: to.publicKeyString,
        nonce: encode(nonceBits),
        message: encode(cipherBits)
    };
}

// Decrypt message envelope
async function decryptMessage(from, envelope, sharedSecret, isJSON = true) {
    const nonceBits = decode(envelope.nonce);
    const cipherBits = decode(envelope.message);
    const symmetricKey = from.publicKey;

    const clearBits = await decrypt(cipherBits, nonceBits, symmetricKey);
    if (!clearBits) throw new Error("Decryption failed");

    const clearString = bitsToString(clearBits);
    return isJSON ? JSON.parse(clearString) : clearString;
}

export {
    generateEncryptionKeys,
    deriveSymmetricKey,
    encryptMessage,
    decryptMessage,
    getRandomValues,
    importPublicKey,
    importPrivateKey,
    encode,
    decode,
    stringToBits,
    bitsToString,

    encrypt, decrypt
};
