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
export {stringToBits, bitsToString, base64url};