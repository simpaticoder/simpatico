/**
 * Multi-Format Encoding Library
 * Supports encoding and decoding Uint8Array to/from various formats:
 * - Base64 (standard RFC 4648)
 * - Base64 URL-safe (RFC 4648 Section 5)
 * - UTF-8
 * - Hexadecimal
 */

export default Encoder = {
    /**
     * Base64 encoding/decoding (standard with padding)
     */
    base64: {
        /**
         * Encode Uint8Array to Base64 string
         * @param {Uint8Array} bytes - Binary data to encode
         * @returns {string} Base64 encoded string
         */
        encode(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new TypeError('Input must be a Uint8Array');
            }

            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            let result = '';
            let i = 0;

            while (i < bytes.length) {
                const a = bytes[i++];
                const b = i < bytes.length ? bytes[i++] : 0;
                const c = i < bytes.length ? bytes[i++] : 0;

                const bitmap = (a << 16) | (b << 8) | c;

                result += chars.charAt((bitmap >> 18) & 63);
                result += chars.charAt((bitmap >> 12) & 63);
                result += i - 2 < bytes.length ? chars.charAt((bitmap >> 6) & 63) : '=';
                result += i - 1 < bytes.length ? chars.charAt(bitmap & 63) : '=';
            }

            return result;
        },

        /**
         * Decode Base64 string to Uint8Array
         * @param {string} str - Base64 encoded string
         * @returns {Uint8Array} Decoded binary data
         */
        decode(str) {
            if (typeof str !== 'string') {
                throw new TypeError('Input must be a string');
            }

            // Remove whitespace and validate characters
            str = str.replace(/\s/g, '');
            if (!/^[A-Za-z0-9+/]*={0,2}$/.test(str)) {
                throw new Error('Invalid Base64 string');
            }

            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
            const lookup = new Uint8Array(256);
            for (let i = 0; i < chars.length; i++) {
                lookup[chars.charCodeAt(i)] = i;
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
        }
    },

    /**
     * Base64 URL-safe encoding/decoding (no padding, URL-safe characters)
     */
    base64url: {
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
        }
    },

    /**
     * UTF-8 encoding/decoding
     */
    utf8: {
        /**
         * Encode UTF-8 string to Uint8Array
         * @param {string} str - UTF-8 string to encode
         * @returns {Uint8Array} Encoded binary data
         */
        encode(str) {
            if (typeof str !== 'string') {
                throw new TypeError('Input must be a string');
            }

            const bytes = [];
            for (let i = 0; i < str.length; i++) {
                let code = str.charCodeAt(i);

                // Handle surrogate pairs for characters outside BMP
                if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
                    const hi = code;
                    const lo = str.charCodeAt(++i);
                    if (lo >= 0xDC00 && lo <= 0xDFFF) {
                        code = 0x10000 + (((hi & 0x3FF) << 10) | (lo & 0x3FF));
                    }
                }

                if (code < 0x80) {
                    bytes.push(code);
                } else if (code < 0x800) {
                    bytes.push(0xC0 | (code >> 6));
                    bytes.push(0x80 | (code & 0x3F));
                } else if (code < 0x10000) {
                    bytes.push(0xE0 | (code >> 12));
                    bytes.push(0x80 | ((code >> 6) & 0x3F));
                    bytes.push(0x80 | (code & 0x3F));
                } else {
                    bytes.push(0xF0 | (code >> 18));
                    bytes.push(0x80 | ((code >> 12) & 0x3F));
                    bytes.push(0x80 | ((code >> 6) & 0x3F));
                    bytes.push(0x80 | (code & 0x3F));
                }
            }

            return new Uint8Array(bytes);
        },

        /**
         * Decode Uint8Array to UTF-8 string
         * @param {Uint8Array} bytes - Binary data to decode
         * @returns {string} Decoded UTF-8 string
         */
        decode(bytes) {
            if (!(bytes instanceof Uint8Array)) {
                throw new TypeError('Input must be a Uint8Array');
            }

            let result = '';
            let i = 0;

            while (i < bytes.length) {
                let c = bytes[i++];

                if (c < 0x80) {
                    // 1-byte character
                    result += String.fromCharCode(c);
                } else if ((c & 0xE0) === 0xC0) {
                    // 2-byte character
                    if (i >= bytes.length) throw new Error('Invalid UTF-8: incomplete 2-byte sequence');
                    const c2 = bytes[i++];
                    if ((c2 & 0xC0) !== 0x80) throw new Error('Invalid UTF-8: invalid continuation byte');
                    result += String.fromCharCode(((c & 0x1F) << 6) | (c2 & 0x3F));
                } else if ((c & 0xF0) === 0xE0) {
                    // 3-byte character
                    if (i + 1 >= bytes.length) throw new Error('Invalid UTF-8: incomplete 3-byte sequence');
                    const c2 = bytes[i++];
                    const c3 = bytes[i++];
                    if ((c2 & 0xC0) !== 0x80 || (c3 & 0xC0) !== 0x80) {
                        throw new Error('Invalid UTF-8: invalid continuation byte');
                    }
                    result += String.fromCharCode(((c & 0x0F) << 12) | ((c2 & 0x3F) << 6) | (c3 & 0x3F));
                } else if ((c & 0xF8) === 0xF0) {
                    // 4-byte character (needs surrogate pair)
                    if (i + 2 >= bytes.length) throw new Error('Invalid UTF-8: incomplete 4-byte sequence');
                    const c2 = bytes[i++];
                    const c3 = bytes[i++];
                    const c4 = bytes[i++];
                    if ((c2 & 0xC0) !== 0x80 || (c3 & 0xC0) !== 0x80 || (c4 & 0xC0) !== 0x80) {
                        throw new Error('Invalid UTF-8: invalid continuation byte');
                    }
                    const code = ((c & 0x07) << 18) | ((c2 & 0x3F) << 12) | ((c3 & 0x3F) << 6) | (c4 & 0x3F);
                    if (code > 0x10FFFF) throw new Error('Invalid UTF-8: code point out of range');

                    // Convert to surrogate pair
                    const hi = 0xD800 + ((code - 0x10000) >> 10);
                    const lo = 0xDC00 + ((code - 0x10000) & 0x3FF);
                    result += String.fromCharCode(hi, lo);
                } else {
                    throw new Error(`Invalid UTF-8: invalid byte 0x${c.toString(16).padStart(2, '0')}`);
                }
            }

            return result;
        }
    },

    /**
     * Hexadecimal encoding/decoding
     */
    hex: {
        /**
         * Encode Uint8Array to hexadecimal string
         * @param {Uint8Array} bytes - Binary data to encode
         * @param {boolean} uppercase - Whether to use uppercase letters (default: false)
         * @returns {string} Hexadecimal encoded string
         */
        encode(bytes, uppercase = false) {
            if (!(bytes instanceof Uint8Array)) {
                throw new TypeError('Input must be a Uint8Array');
            }

            let result = '';
            const chars = uppercase ? '0123456789ABCDEF' : '0123456789abcdef';

            for (let i = 0; i < bytes.length; i++) {
                const byte = bytes[i];
                result += chars[byte >> 4] + chars[byte & 0x0F];
            }

            return result;
        },

        /**
         * Decode hexadecimal string to Uint8Array
         * @param {string} str - Hexadecimal encoded string
         * @returns {Uint8Array} Decoded binary data
         */
        decode(str) {
            if (typeof str !== 'string') {
                throw new TypeError('Input must be a string');
            }

            // Remove whitespace and validate
            str = str.replace(/\s/g, '');
            if (!/^[0-9a-fA-F]*$/.test(str)) {
                throw new Error('Invalid hexadecimal string');
            }
            if (str.length % 2 !== 0) {
                throw new Error('Hexadecimal string must have even length');
            }

            const bytes = new Uint8Array(str.length / 2);

            for (let i = 0; i < str.length; i += 2) {
                const high = parseInt(str[i], 16);
                const low = parseInt(str[i + 1], 16);
                bytes[i / 2] = (high << 4) | low;
            }

            return bytes;
        }
    },

    /**
     * Utility functions for format detection and conversion
     */
    utils: {
        /**
         * Detect the likely encoding format of a string
         * @param {string} str - String to analyze
         * @returns {string} Likely format: 'base64', 'base64url', 'hex', 'utf8', or 'unknown'
         */
        detectFormat(str) {
            if (typeof str !== 'string') return 'unknown';

            // Remove whitespace for analysis
            const clean = str.replace(/\s/g, '');

            // Check for hex (only 0-9, a-f, A-F, even length)
            if (/^[0-9a-fA-F]+$/.test(clean) && clean.length % 2 === 0 && clean.length > 0) {
                return 'hex';
            }

            // Check for base64url (no padding, URL-safe chars)
            if (/^[A-Za-z0-9_-]+$/.test(clean)) {
                return 'base64url';
            }

            // Check for base64 (with padding, standard chars)
            if (/^[A-Za-z0-9+/]*(={0,2})$/.test(clean) && clean.includes('+') || clean.includes('/') || clean.includes('=')) {
                return 'base64';
            }

            // If it contains non-ASCII or typical text patterns, likely UTF-8
            if (/[\u0080-\uFFFF]/.test(str) || /\s/.test(str)) {
                return 'utf8';
            }

            return 'unknown';
        },

        /**
         * Convert between different encoding formats
         * @param {string} data - Input data
         * @param {string} fromFormat - Source format ('base64', 'base64url', 'hex', 'utf8')
         * @param {string} toFormat - Target format ('base64', 'base64url', 'hex', 'utf8')
         * @returns {string} Converted data
         */
        convert(data, fromFormat, toFormat) {
            if (fromFormat === toFormat) return data;

            // First decode to bytes
            let bytes;
            switch (fromFormat) {
                case 'base64':
                    bytes = Encoder.base64.decode(data);
                    break;
                case 'base64url':
                    bytes = Encoder.base64url.decode(data);
                    break;
                case 'hex':
                    bytes = Encoder.hex.decode(data);
                    break;
                case 'utf8':
                    bytes = Encoder.utf8.decode(data);
                    break;
                default:
                    throw new Error(`Unsupported source format: ${fromFormat}`);
            }

            // Then encode to target format
            switch (toFormat) {
                case 'base64':
                    return Encoder.base64.encode(bytes);
                case 'base64url':
                    return Encoder.base64url.encode(bytes);
                case 'hex':
                    return Encoder.hex.encode(bytes);
                case 'utf8':
                    return Encoder.utf8.decode(bytes);
                default:
                    throw new Error(`Unsupported target format: ${toFormat}`);
            }
        }
    }
};


// Self-test function
Encoder.test = function() {
    console.log('Running Encoder tests...');

    const testData = 'Hello, World! 🌍 This is a test with émojis and ünïcödé.';
    const testBytes = Encoder.utf8.encode(testData);

    try {
        // Test UTF-8
        const utf8Result = Encoder.utf8.decode(testBytes);
        console.assert(utf8Result === testData, 'UTF-8 round-trip failed');

        // Test Base64
        const base64Encoded = Encoder.base64.encode(testBytes);
        const base64Decoded = Encoder.base64.decode(base64Encoded);
        console.assert(Encoder.utf8.decode(base64Decoded) === testData, 'Base64 round-trip failed');

        // Test Base64URL
        const base64urlEncoded = Encoder.base64url.encode(testBytes);
        const base64urlDecoded = Encoder.base64url.decode(base64urlEncoded);
        console.assert(Encoder.utf8.decode(base64urlDecoded) === testData, 'Base64URL round-trip failed');

        // Test Hex
        const hexEncoded = Encoder.hex.encode(testBytes);
        const hexDecoded = Encoder.hex.decode(hexEncoded);
        console.assert(Encoder.utf8.decode(hexDecoded) === testData, 'Hex round-trip failed');

        // Test conversions
        const converted = Encoder.utils.convert(base64Encoded, 'base64', 'hex');
        console.assert(converted === hexEncoded, 'Base64 to Hex conversion failed');

        // Test format detection
        console.assert(Encoder.utils.detectFormat(base64Encoded) === 'base64', 'Base64 detection failed');
        console.assert(Encoder.utils.detectFormat(base64urlEncoded) === 'base64url', 'Base64URL detection failed');
        console.assert(Encoder.utils.detectFormat(hexEncoded) === 'hex', 'Hex detection failed');

        console.log('All tests passed!');

        // Show examples
        console.log('\nExamples:');
        console.log('Original:', testData);
        console.log('Base64:', base64Encoded);
        console.log('Base64URL:', base64urlEncoded);
        console.log('Hex:', hexEncoded);
        console.log('Detected Base64 format:', Encoder.utils.detectFormat(base64Encoded));

    } catch (error) {
        console.error('Test failed:', error);
    }
};
