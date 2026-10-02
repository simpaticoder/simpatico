// test-setuid.js
import http from 'node:http';

function listenPromise(server, port, host = '0.0.0.0') {
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => resolve());
    server.on('error', (err) => reject(err));
  });
}

async function main() {
  console.log('=== Initial State ===');
  console.log('UID:', process.getuid(), 'EUID:', process.geteuid());
  console.log('GID:', process.getgid(), 'EGID:', process.getegid());

  // Test 1: Bind to privileged port 80 before setuid
  console.log('\n=== Test 1: Bind to port 80 (privileged) BEFORE setuid ===');
  try {
    const server80 = http.createServer((req, res) => res.end('test'));
    await listenPromise(server80, 80);
    console.log('✓ Successfully bound to port 80');
    server80.close();
  } catch (error) {
    console.error('✗ Failed to bind to port 80:', error.message);
  }

  // Test 2: Bind to non-privileged port before setuid
  console.log('\n=== Test 2: Bind to port 8080 (non-privileged) BEFORE setuid ===');
  try {
    const server8080 = http.createServer((req, res) => res.end('test'));
    await listenPromise(server8080, 8080);
    console.log('✓ Successfully bound to port 8080');
    server8080.close();
  } catch (error) {
    console.error('✗ Failed to bind to port 8080:', error.message);
  }

  // Test 3: Attempt setuid to nobody
  console.log('\n=== Test 3: Attempting setuid to nobody ===');
  const targetUser = process.argv[2] || 'nobody';
  try {
    console.log(`Attempting to drop privileges to: ${targetUser}`);

    // The correct order: setgroups, setgid, setuid
    process.setgroups([]);

    // Try setgid with the name first; if that fails, look up numeric GID
    try {
      process.setgid(targetUser);
    } catch {
      console.log('Note: setgid with name failed, trying numeric GID from passwd');
      const { execSync } = await import('node:child_process');
      const entry = execSync(`getent passwd ${targetUser}`, { encoding: 'utf8' }).trim();
      const gid = parseInt(entry.split(':')[3], 10);
      process.setgid(gid);
      console.log(`  Resolved GID ${gid} from password entry`);
    }

    process.setuid(targetUser);
    console.log('✓ Privilege drop succeeded');
    console.log('New UID:', process.getuid(), 'EUID:', process.geteuid());
    console.log('New GID:', process.getgid(), 'EGID:', process.getegid());
  } catch (error) {
    console.error('✗ Privilege drop failed:', error.message);
    process.exit(1);
  }

  // Test 4: Try binding after setuid
  console.log('\n=== Test 4: Bind to port 8080 AFTER setuid ===');
  try {
    const server8080After = http.createServer((req, res) => res.end('test'));
    await listenPromise(server8080After, 8080);
    console.log('✓ Successfully bound to port 8080 after setuid');
    server8080After.close();
  } catch (error) {
    console.error('✗ Failed to bind to port 8080 after setuid:', error.message);
  }

  console.log('\n=== Test 5: Try binding to port 80 AFTER setuid (should fail) ===');
  try {
    const server80After = http.createServer((req, res) => res.end('test'));
    await listenPromise(server80After, 80);
    console.log('✓ Surprisingly still bound to port 80 after setuid');
    server80After.close();
  } catch (error) {
    console.error('✗ Expected failure - cannot bind to port 80 after setuid:', error.message);
  }
}

main().catch(console.error);