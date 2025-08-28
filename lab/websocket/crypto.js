import nacl from 'tweetnacl-es6';

export default {
    /**
     * Generate a new key pair for asymmetric encryption
     * @returns {Object} {publicKey: string, privateKey: string}
     */
    generateKeyPair() {
        const keyPair = nacl.box.keyPair();
        return {
            publicKey: this.encode(keyPair.publicKey),
            privateKey: this.encode(keyPair.secretKey)
        };
    },

    /**
     * Encrypt a message for a recipient
     * @param {string} message - Plain text message
     * @param {string} recipientPublicKey - Base64 encoded public key
     * @param {string} senderPrivateKey - Base64 encoded private key
     * @returns {string} Base64 encoded encrypted message
     */
    encrypt(message, recipientPublicKey, senderPrivateKey) {
        const messageUint8 = naclUtil.decodeUTF8(message);
        const nonce = nacl.randomBytes(nacl.box.nonceLength);
        const recipientPublicKeyUint8 = naclUtil.decodeBase64(recipientPublicKey);
        const senderPrivateKeyUint8 = naclUtil.decodeBase64(senderPrivateKey);

        const encrypted = nacl.box(messageUint8, nonce, recipientPublicKeyUint8, senderPrivateKeyUint8);

        // Combine nonce and encrypted message
        const fullMessage = new Uint8Array(nonce.length + encrypted.length);
        fullMessage.set(nonce);
        fullMessage.set(encrypted, nonce.length);

        return this.encode(fullMessage);
    },

    /**
     * Decrypt a message
     * @param {string} encryptedMessage - Base64 encoded encrypted message
     * @param {string} senderPublicKey - Base64 encoded public key
     * @param {string} recipientPrivateKey - Base64 encoded private key
     * @returns {string} Decrypted message
     */
    decrypt(encryptedMessage, senderPublicKey, recipientPrivateKey) {
        const encryptedData = naclUtil.decodeBase64(encryptedMessage);
        const nonce = encryptedData.slice(0, nacl.box.nonceLength);
        const message = encryptedData.slice(nacl.box.nonceLength);
        const senderPublicKeyUint8 = naclUtil.decodeBase64(senderPublicKey);
        const recipientPrivateKeyUint8 = naclUtil.decodeBase64(recipientPrivateKey);

        const decrypted = nacl.box.open(message, nonce, senderPublicKeyUint8, recipientPrivateKeyUint8);
        if (!decrypted) {
            throw new Error('Failed to decrypt message');
        }

        return naclUtil.encodeUTF8(decrypted);
    },

    /**
     * Sign data with a private key
     * @param {string} privateKey - Base64 encoded private key
     * @param {string|Uint8Array} data - Data to sign
     * @returns {string} Base64 encoded signature
     */
    sign(privateKey, data) {
        const keyPair = nacl.sign.keyPair.fromSecretKey(naclUtil.decodeBase64(privateKey));
        const dataUint8 = typeof data === 'string' ? naclUtil.decodeUTF8(data) : data;
        const signature = nacl.sign.detached(dataUint8, keyPair.secretKey);
        return this.encode(signature);
    },

    /**
     * Verify a signature
     * @param {string} publicKey - Base64 encoded public key
     * @param {string} signature - Base64 encoded signature
     * @param {string} data - Original data
     * @returns {boolean} True if signature is valid
     */
    verify(publicKey, signature, data) {
        try {
            const publicKeyUint8 = this.decode(publicKey);
            const signatureUint8 = this.decode(signature);
            return nacl.sign.detached.verify(data, signatureUint8, publicKeyUint8);
        } catch (error) {
            return false;
        }
    },

    /**
     * Encode Uint8Array to Base64 URL-safe string
     * @param {Uint8Array} bytes - Binary data to encode
     * @returns {string} Base64 URL-safe encoded string (no padding)
     */
    encode(bytes) {
        if (!(bytes instanceof Uint8Array)) {
            throw new TypeError('Input must be a Uint8Array');
        }

        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        let result = '';
        let i = 0;

        while (i < bytes.length) {
            const a = bytes[i++];
            const b = i < bytes.length ? bytes[i++] : 0;
            const c = i < bytes.length ? bytes[i++] : 0;

            const bitmap = (a << 16) | (b << 8) | c;

            result += chars.charAt((bitmap >> 18) & 63);
            result += chars.charAt((bitmap >> 12) & 63);
            if (i - 2 < bytes.length) result += chars.charAt((bitmap >> 6) & 63);
            if (i - 1 < bytes.length) result += chars.charAt(bitmap & 63);
        }

        return result;
    },

    /**
     * Decode Base64 URL-safe string to Uint8Array
     * @param {string} str - Base64 URL-safe encoded string
     * @returns {Uint8Array} Decoded binary data
     */
    decode(str) {
        if (typeof str !== 'string') {
            throw new TypeError('Input must be a string');
        }

        // Remove whitespace and validate characters
        str = str.replace(/\s/g, '');
        if (!/^[A-Za-z0-9_-]*$/.test(str)) {
            throw new Error('Invalid Base64 URL-safe string');
        }

        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        const lookup = new Uint8Array(256);
        for (let i = 0; i < chars.length; i++) {
            lookup[chars.charCodeAt(i)] = i;
        }

        // Add padding for decoding
        while (str.length % 4) {
            str += '=';
        }

        let bufferLength = str.length * 0.75;
        if (str.endsWith('==')) bufferLength -= 2;
        else if (str.endsWith('=')) bufferLength -= 1;

        const bytes = new Uint8Array(Math.floor(bufferLength));
        let p = 0;

        for (let i = 0; i < str.length; i += 4) {
            const encoded1 = lookup[str.charCodeAt(i)] || 0;
            const encoded2 = lookup[str.charCodeAt(i + 1)] || 0;
            const encoded3 = str[i + 2] === '=' ? 0 : lookup[str.charCodeAt(i + 2)] || 0;
            const encoded4 = str[i + 3] === '=' ? 0 : lookup[str.charCodeAt(i + 3)] || 0;

            bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
            if (str[i + 2] !== '=' && p < bytes.length) {
                bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
            }
            if (str[i + 3] !== '=' && p < bytes.length) {
                bytes[p++] = ((encoded3 & 3) << 6) | encoded4;
            }
        }

        return bytes;
    },

    randomBytes(length = 32){
        return nacl.getRandomValues(length);
    }

};