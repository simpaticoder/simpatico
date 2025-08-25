import nacl from '/vendor/nacl.js';

export const CryptoUtils = {
    generateRandomBytes: (length) => {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return array;
    },

    arrayBufferToBase64: (buffer) => {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    },

    base64ToUint8Array: (base64) => {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    },

    generateKeyPair: () => nacl.sign.keyPair(),

    sign: (data, privateKey) => nacl.sign.detached(data, privateKey),

    verify: (data, signature, publicKey) =>
        nacl.sign.detached.verify(data, signature, publicKey)
};