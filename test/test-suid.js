// test-setuid.js
import http from 'node:http';

console.log('=== Initial State ===');
console.log('UID:', process.getuid(), 'EUID:', process.geteuid());
console.log('GID:', process.getgid(), 'EGID:', process.getegid());

// Test 1: Bind to privileged port 80 before setuid
console.log('\n=== Test 1: Bind to port 80 (privileged) BEFORE setuid ===');
try {
    const server80 = http.createServer((req, res) => res.end('test')).listen(80, '0.0.0.0');
    console.log('✓ Successfully bound to port 80');
    server80.close();
} catch (error) {
    console.error('✗ Failed to bind to port 80:', error.message);
}

// Test 2: Bind to non-privileged port before setuid
console.log('\n=== Test 2: Bind to port 8080 (non-privileged) BEFORE setuid ===');
try {
    const server8080 = http.createServer((req, res) => res.end('test')).listen(8080, '0.0.0.0');
    console.log('✓ Successfully bound to port 8080');
    server8080.close();
} catch (error) {
    console.error('✗ Failed to bind to port 8080:', error.message);
}

// Test 3: Attempt setuid
console.log('\n=== Test 3: Attempting setuid ===');
try {
    const targetUser = process.argv[2] || 'nobody'; // Pass username as argument
    console.log(`Attempting setuid to: ${targetUser}`);
    process.setuid(targetUser);
    console.log('✓ setuid succeeded');
    console.log('New UID:', process.getuid(), 'EUID:', process.geteuid());
} catch (error) {
    console.error('✗ setuid failed:', error.message);
    process.exit(1); // Exit if setuid fails
}

// Test 4: Try binding after setuid
console.log('\n=== Test 4: Bind to port 8080 AFTER setuid ===');
try {
    const server8080After = http.createServer((req, res) => res.end('test')).listen(8080, '0.0.0.0');
    console.log('✓ Successfully bound to port 8080 after setuid');
    server8080After.close();
} catch (error) {
    console.error('✗ Failed to bind to port 8080 after setuid:', error.message);
}

console.log('\n=== Test 5: Try binding to port 80 AFTER setuid (should fail) ===');
try {
    const server80After = http.createServer((req, res) => res.end('test')).listen(80, '0.0.0.0');
    console.log('✓ Surprisingly still bound to port 80 after setuid');
    server80After.close();
} catch (error) {
    console.error('✗ Expected failure - cannot bind to port 80 after setuid:', error.message);
}