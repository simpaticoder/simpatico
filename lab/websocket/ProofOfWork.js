/**
 * Proof of Work Library
 * SHA-256 based proof-of-work implementation for web browsers
 */

export class ProofOfWork {
    constructor() {
        this.solving = false;
        this.currentOperation = null;
    }

    /**
     * Generate a SHA-256 hash of the input string
     * @param {string} data - Input string to hash
     * @returns {Promise<Uint8Array>} Hash as byte array
     */
    async sha256(data) {
        const encoder = new TextEncoder();
        const dataBuffer = encoder.encode(data);
        const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
        return new Uint8Array(hashBuffer);
    }

    /**
     * Convert byte array to hexadecimal string
     * @param {Uint8Array} bytes - Input bytes
     * @returns {string} Hex string
     */
    bytesToHex(bytes) {
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Convert byte array to binary string
     * @param {Uint8Array} bytes - Input bytes
     * @returns {string} Binary string
     */
    bytesToBinary(bytes) {
        return Array.from(bytes)
            .map(b => b.toString(2).padStart(8, '0'))
            .join('');
    }

    /**
     * Count leading zero bits in a binary string
     * @param {string} binaryString - Binary string
     * @returns {number} Number of leading zeros
     */
    countLeadingZeros(binaryString) {
        let count = 0;
        for (let i = 0; i < binaryString.length; i++) {
            if (binaryString[i] === '0') {
                count++;
            } else {
                break;
            }
        }
        return count;
    }

    /**
     * Generate a new challenge string
     * @param {string} [prefix='pow'] - Challenge prefix
     * @returns {string} Challenge string
     */
    generateChallenge(prefix = 'pow') {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(2, 10);
        return `${prefix}_${timestamp}_${random}`;
    }

    /**
     * Solve proof of work for a given challenge and difficulty
     * @param {string} challenge - Challenge string
     * @param {number} difficulty - Required number of leading zero bits
     * @param {Object} options - Solving options
     * @param {number} [options.batchSize=1000] - Hashes per batch
     * @param {function} [options.onProgress] - Progress callback
     * @returns {Promise<Object>} Solution object with nonce, hash, stats
     */
    async solve(challenge, difficulty, options = {}) {
        const {
            batchSize = 1000,
            onProgress = null
        } = options;

        if (this.solving) {
            throw new Error('Already solving a proof of work');
        }

        this.solving = true;
        const startTime = performance.now();
        let nonce = 0;
        let attempts = 0;

        try {
            while (this.solving) {
                // Process batch
                for (let i = 0; i < batchSize && this.solving; i++) {
                    const candidate = challenge + nonce;
                    const hash = await this.sha256(candidate);
                    const binary = this.bytesToBinary(hash);
                    const leadingZeros = this.countLeadingZeros(binary);

                    attempts++;
                    nonce++;

                    if (leadingZeros >= difficulty) {
                        const endTime = performance.now();
                        const duration = (endTime - startTime) / 1000;

                        this.solving = false;
                        return {
                            success: true,
                            nonce: nonce - 1,
                            hash: this.bytesToHex(hash),
                            hashBytes: hash,
                            leadingZeros,
                            stats: {
                                attempts,
                                duration,
                                hashRate: Math.round(attempts / duration)
                            }
                        };
                    }
                }

                // Progress callback
                if (onProgress && this.solving) {
                    const currentTime = performance.now();
                    const duration = (currentTime - startTime) / 1000;
                    onProgress({
                        attempts,
                        duration,
                        hashRate: Math.round(attempts / duration)
                    });
                }

                // Yield control to prevent blocking
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            return {
                success: false,
                message: 'Solving was stopped'
            };

        } catch (error) {
            this.solving = false;
            throw error;
        }
    }

    /**
     * Stop current solving operation
     */
    stop() {
        this.solving = false;
    }

    /**
     * Verify a proof of work solution
     * @param {string} challenge - Original challenge
     * @param {number} nonce - Proposed nonce
     * @param {number} difficulty - Required difficulty
     * @returns {Promise<Object>} Verification result
     */
    async verify(challenge, nonce, difficulty) {
        const candidate = challenge + nonce;
        const hash = await this.sha256(candidate);
        const binary = this.bytesToBinary(hash);
        const leadingZeros = this.countLeadingZeros(binary);

        return {
            valid: leadingZeros >= difficulty,
            leadingZeros,
            hash: this.bytesToHex(hash),
            hashBytes: hash
        };
    }

    /**
     * Estimate difficulty for target solving time
     * @param {number} targetSeconds - Target solving time in seconds
     * @param {number} [estimatedHashRate=100000] - Estimated hash rate per second
     * @returns {number} Suggested difficulty (zero bits)
     */
    estimateDifficulty(targetSeconds, estimatedHashRate = 100000) {
        const targetHashes = targetSeconds * estimatedHashRate;
        const difficulty = Math.log2(targetHashes);
        return Math.round(difficulty);
    }

    /**
     * Get current solving status
     * @returns {boolean} True if currently solving
     */
    isSolving() {
        return this.solving;
    }
}

/**
 * Utility functions for proof of work
 */
export class ProofOfWorkUtils {
    /**
     * Create a proof of work challenge with metadata
     * @param {Object} metadata - Challenge metadata
     * @returns {Object} Challenge object
     */
    static createChallenge(metadata = {}) {
        const pow = new ProofOfWork();
        return {
            challenge: pow.generateChallenge(),
            difficulty: metadata.difficulty || 16,
            timestamp: Date.now(),
            metadata
        };
    }

    /**
     * Batch verify multiple solutions
     * @param {Array} solutions - Array of {challenge, nonce, difficulty} objects
     * @returns {Promise<Array>} Array of verification results
     */
    static async batchVerify(solutions) {
        const pow = new ProofOfWork();
        const results = [];

        for (const solution of solutions) {
            const result = await pow.verify(
                solution.challenge,
                solution.nonce,
                solution.difficulty
            );
            results.push({
                ...result,
                challenge: solution.challenge,
                nonce: solution.nonce
            });
        }

        return results;
    }

    /**
     * Benchmark hash rate on current device
     * @param {number} [duration=1000] - Benchmark duration in ms
     * @returns {Promise<Object>} Benchmark results
     */
    static async benchmarkHashRate(duration = 1000) {
        const pow = new ProofOfWork();
        const challenge = pow.generateChallenge('benchmark');
        const startTime = performance.now();
        let hashes = 0;

        while (performance.now() - startTime < duration) {
            await pow.sha256(challenge + hashes);
            hashes++;
        }

        const actualDuration = (performance.now() - startTime) / 1000;
        const hashRate = Math.round(hashes / actualDuration);

        return {
            hashes,
            duration: actualDuration,
            hashRate,
            recommendedDifficulty: {
                fast: Math.log2(hashRate * 0.05), // ~50ms
                medium: Math.log2(hashRate * 0.1), // ~100ms
                slow: Math.log2(hashRate * 0.5)    // ~500ms
            }
        };
    }
}

// Default export
export default ProofOfWork;