# SHA-256 Proof of Work Implementation

This document implements a complete SHA-256 based proof-of-work system in the browser. The system asks clients to find a nonce such that when combined with a challenge string and hashed with SHA-256, the result has a specified number of leading zero bits.

This implementation uses the browser's build in WebCrypto API.

This implementation provides:
- **Adjustable Difficulty**: 8-24 zero bits (16 bits ≈ 0.1s on modern laptops)
- **Non-blocking Processing**: Uses batched computation to maintain UI responsiveness
- **Real-time Feedback**: Shows progress, hash rate, and performance statistics
- **Pre-computation Protection**: Timestamped challenges prevent lookup table attacks


## HTML Structure and Styling

First, we set up the basic HTML structure with a clean, modern interface:

```html
<div class="container">
    <h1>SHA-256 Proof of Work</h1>
    
    <div class="challenge">
        <strong>Challenge:</strong> Find a nonce such that SHA-256(challenge + nonce) starts with <input type="number" id="difficulty" value="16" min="8" max="24"> zero bits
    </div>

    <button onclick="generateChallenge()">New Challenge</button>
    <button id="solveBtn" onclick="solveProofOfWork()">Solve Proof of Work</button>
    <button onclick="stopSolving()">Stop</button>

    <div id="currentChallenge"></div>
    <div id="result"></div>
    <div id="stats"></div>
</div>

```

The styling creates a professional, card-based layout with color-coded sections for different types of information:

```css
.container {
    padding: 30px;
    border-radius: 10px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
}
.challenge {
    padding: 15px;
    border-radius: 5px;
    margin: 10px 0;
    font-family: monospace;
    border-left: 4px solid #007bff;
}
.result {
    padding: 15px;
    border-radius: 5px;
    margin: 10px 0;
    border-left: 4px solid #28a745;
}
.stats {
    padding: 15px;
    border-radius: 5px;
    margin: 10px 0;
    border-left: 4px solid #ffc107;
}
button {
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    font-size: 16px;
    margin: 5px;
}
button:disabled {
    cursor: not-allowed;
}
input {
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 3px;
    width: 60px;
}
.working {
    font-style: italic;
}

```

## Core Cryptographic Functions

The heart of the system is the SHA-256 hashing function. We use the Web Crypto API for secure, native performance:

```js
// Simple SHA-256 implementation using Web Crypto API
async function sha256(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return new Uint8Array(hashBuffer);
}
window.sha256 = sha256;
```

We need utility functions to convert between different data representations:

```js
function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function bytesToBinary(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(2).padStart(8, '0'))
        .join('');
}
window.bytesToHex = bytesToHex;
window.bytesToBinary = bytesToBinary;
```

The proof-of-work validation requires counting leading zeros in the binary representation:

```js
function countLeadingZeros(binaryString) {
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
window.countLeadingZeros = countLeadingZeros;
```

## Challenge Generation

To prevent pre-computation attacks, each challenge includes a timestamp and random component:

```js
let currentChallenge = '';
let solving = false;
let startTime = 0;

function generateChallenge() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    currentChallenge = `pow_${timestamp}_${random}`;
    
    document.getElementById('currentChallenge').innerHTML = `
        <div class="challenge">
            <strong>Current Challenge:</strong> ${currentChallenge}
        </div>
    `;
    
    document.getElementById('result').innerHTML = '';
    document.getElementById('stats').innerHTML = '';
}
window.generateChallenge = generateChallenge;
```

## Proof-of-Work Solver

The main solving algorithm implements a batched approach to prevent UI blocking while maintaining high hash rates:

```js
async function solveProofOfWork() {
    if (solving) return;
    
    const difficulty = parseInt(document.getElementById('difficulty').value);
    if (!currentChallenge) {
        generateChallenge();
    }

    solving = true;
    startTime = performance.now();
    document.getElementById('solveBtn').disabled = true;
    document.getElementById('result').innerHTML = '<div class="working">Working...</div>';
    
    let nonce = 0;
    let attempts = 0;
    
    const solve = async () => {
        const batchSize = 1000; // Process in batches to avoid blocking UI
        
        for (let i = 0; i < batchSize && solving; i++) {
            const candidate = currentChallenge + nonce;
            const hash = await sha256(candidate);
            const binary = bytesToBinary(hash);
            const leadingZeros = countLeadingZeros(binary);
            
            attempts++;
            nonce++;
            
            if (leadingZeros >= difficulty) {
                const endTime = performance.now();
                const duration = (endTime - startTime) / 1000;
                
                document.getElementById('result').innerHTML = `
                    <div class="result">
                        <strong>✓ Solution Found!</strong><br>
                        <strong>Nonce:</strong> ${nonce - 1}<br>
                        <strong>Hash:</strong> ${bytesToHex(hash)}<br>
                        <strong>Leading zeros:</strong> ${leadingZeros} bits
                    </div>
                `;
                
                document.getElementById('stats').innerHTML = `
                    <div class="stats">
                        <strong>Stats:</strong><br>
                        Time: ${duration.toFixed(3)}s<br>
                        Attempts: ${attempts.toLocaleString()}<br>
                        Hash rate: ${Math.round(attempts / duration).toLocaleString()} hashes/sec
                    </div>
                `;
                
                solving = false;
                document.getElementById('solveBtn').disabled = false;
                return;
            }
        }
        
        // Update progress and continue
        if (solving) {
            document.getElementById('result').innerHTML = `
                <div class="working">
                    Working... ${attempts.toLocaleString()} attempts, ${Math.round(attempts / ((performance.now() - startTime) / 1000)).toLocaleString()} hashes/sec
                </div>
            `;
            setTimeout(solve, 0); // Continue in next tick
        }
    };
    
    solve();
}
window.solveProofOfWork = solveProofOfWork;
window.solving = false;
window.startTime = null;
```

## Control Functions

Users need the ability to stop long-running computations:

```js
function stopSolving() {
    solving = false;
    document.getElementById('solveBtn').disabled = false;
    document.getElementById('result').innerHTML = '<div>Stopped.</div>';
}
window.stopSolving = stopSolving
```

## Verification Function

For server-side verification, we provide a simple validation function:

```js
async function verifyProofOfWork(challenge, nonce, expectedDifficulty) {
    const candidate = challenge + nonce;
    const hash = await sha256(candidate);
    const binary = bytesToBinary(hash);
    const leadingZeros = countLeadingZeros(binary);

    return leadingZeros >= expectedDifficulty;
}
window.verifyProofOfWork = verifyProofOfWork
```

## Initialization

Finally, we initialize the application with a default challenge:

```js
// Initialize with a challenge
generateChallenge();
```



