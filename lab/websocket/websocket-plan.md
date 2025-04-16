# Plan

See [crypto](../crypto.md)

```html
<div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: monospace; ">
  <h1>socket Demo</h1>
  <button id="run-basic">Basic</button>
  <button id="run-secure">Secure</button>
  <pre id="message-container" style="background: #f4f4f4; color: #1a3b5d; padding: 15px; margin-top: 20px; height: 500px; overflow: auto; border: 1px solid #ddd;"></pre>
</div>
```

```js
import nacl from '/s/vendor/nacl.js';

// Note: use EventTarget instead (node 15+ and browsers)
class EventEmitter {
  constructor() {
    this.listeners = {};
  }
  
  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    return this;
  }
  
  emit(event, ...args) {
    if (!this.listeners[event]) return;
    this.listeners[event].forEach(callback => callback(...args));
  }
}

/**
 * Store all client connections, support broadcast()
 * Note that the type of client is an event emitter that supports 'message' and 'close'
 */
class SimulatedWebSocketServer extends EventEmitter {
  constructor() {
    super();
    // Set is okay for now with broadcast; eventually should be a Map publicKeyToClient
    this.clients = new Set();
    this.clientToPublicKey = new Map(); // Will store public key associations
    logMessage("Server initialized");
  }
  
  // Handle a new client connection
  addClient(client) {
    this.clients.add(client);
    logMessage("Client connected");
    
    // Initial implementation: just broadcast messages
    client.on('message', (data) => {
      this.broadcast(data, client);
    });
    
    client.on('close', () => {
      this.clients.delete(client);
      this.clientToPublicKey.delete(client);
      logMessage("Client disconnected");
    });
  }
  
  // Send a message to all connected clients except the sender
  broadcast(data, sender) {
    this.clients.forEach(client => {
      if (client !== sender) {
        client.emit('message', data);
      }
    });
  }
}

/**
 * Support a subset of basic WebSocket events (open, send, close).
 * Simulates a 100ms delay between construction and "open".
 */
class SimulatedWebSocketClient extends EventEmitter {
  constructor(url) {
    super();
    this.url = url;
    this.readyState = 0; // Connecting
    logMessage(`Client connecting to ${url}`);
    
    // Simulate connection establishment
    setTimeout(() => {
      this.readyState = 1; // Connected
      this.emit('open');
    }, 100);
  }
  
  // Send a message to the server
  send(data) {
    if (this.readyState === 1) {
      this.emit('message', data);
    } else {
        logMessage("ERROR: Connection not open");
    }
  }
  
  // Close the connection
  close() {
    this.readyState = 3; // Closed
    this.emit('close');
  }
}

function runBasicDemo() {
  const server = new SimulatedWebSocketServer();
  const client = new SimulatedWebSocketClient('ws://localhost:8080');
  
  // Set up server-side handling of this client
  client.on('message', (data) => {
    logMessage(`Server received: ${data}`);
    server.broadcast(data, client);
  });
  
  server.addClient(client);
  
  // Set up client-side message handling
  client.on('open', () => {
    logMessage("Connection established");
    client.send("Hello, server!");
  });
  
  client.on('message', (data) => {
    logMessage(`Client received: ${data}`);
  });
}

// ============================================================

const CryptoUtils = {
  // Generate random bytes for nonce
  generateRandomBytes: (length) => {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return array;
  },
  
  // Convert between formats
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
  
  // Generate key pair
  generateKeyPair: () => {
    return nacl.sign.keyPair();
  },
  
  // Sign data with private key
  sign: (data, privateKey) => {
    return nacl.sign.detached(data, privateKey);
  },
  
  // Verify signature
  verify: (data, signature, publicKey) => {
    return nacl.sign.detached.verify(data, signature, publicKey);
  }
};

/**
 * add more state about pending and completed registration challenges
 * register event handlers on client
 */
class SecureWebSocketServer extends SimulatedWebSocketServer {
  constructor() {
    super();
    // Track authentication states and challenges
    this.pendingChallenges = new Map(); // client -> nonce
    this.authenticatedClients = new Set();
    logMessage("Secure server initialized");
  }
  
  addClient(client) {
    this.clients.add(client);
    logMessage("Client connected - initiating challenge");
    
    // Issue challenge immediately on open
    client.on('open', () => this.issueChallenge(client));
    
    client.on('message', (message) => {
      this.handleMessage(client, message);
    });
    
    client.on('close', () => {
      this.clients.delete(client);
      this.pendingChallenges.delete(client);
      this.authenticatedClients.delete(client);
      this.clientToPublicKey.delete(client);
      logMessage("Client disconnected");
    });
  }

    /**
     * Issue a challenge {type: 'challenge', nonce: [24 random bytes]}
     * 
     * @param client
     */
  issueChallenge(client) {
    const nonce = CryptoUtils.generateRandomBytes(24);
    this.pendingChallenges.set(client, nonce);
    
    const challenge = {
      type: 'challenge',
      nonce: CryptoUtils.arrayBufferToBase64(nonce)
    };
    
    client.emit('message', JSON.stringify(challenge));
    logMessage("Challenge issued " + challenge.nonce);
  }
  
  // Process incoming messages based on type
  handleMessage(client, rawMessage) {
    try {
      const message = JSON.parse(rawMessage);
      
      switch (message.type) {
        case 'auth_response':
          this.handleAuthResponse(client, message);
          break;
          
        case 'secure_message':
          this.handleSecureMessage(client, message);
          break;
          
        default:
          logMessage(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logMessage("Error processing message:", error);
    }
  }
  
  // Verify the signature of the nonce
  handleAuthResponse(client, response) {
    const nonce = this.pendingChallenges.get(client);
    if (!nonce) {
      logMessage("No pending challenge for this client");
      return;
    }
    
    try {
      const publicKey = CryptoUtils.base64ToUint8Array(response.publicKey);
      const signature = CryptoUtils.base64ToUint8Array(response.signature);
      
      // Verify the signature of the nonce
      const isValid = CryptoUtils.verify(nonce, signature, publicKey);
      
      if (isValid) {
        // Authentication successful
        this.authenticatedClients.add(client);
        this.clientToPublicKey.set(client, publicKey);
        
        // Associate this public key with the client for future communication
        const authSuccess = {
          type: 'auth_success',
          message: 'Authentication successful'
        };
        client.emit('message', JSON.stringify(authSuccess));
        logMessage("Client authenticated successfully");
      } else {
        // Authentication failed
        const authFailure = {
          type: 'auth_failure',
          message: 'Signature verification failed'
        };
        client.emit('message', JSON.stringify(authFailure));
        logMessage("Authentication failed - invalid signature");
      }
    } catch (error) {
      logMessage("Authentication error:", error);
      client.emit('message', JSON.stringify({
        type: 'auth_failure',
        message: 'Authentication error'
      }));
    } finally {
      this.pendingChallenges.delete(client);
    }
  }
  
  // The steady state - route based on public key
  handleSecureMessage(client, message) {
    if (!this.authenticatedClients.has(client)) {
      logMessage("Unauthenticated client attempting to send secure message");
      return;
    }
    
    if (!message.targetPublicKey) {
      // Broadcast to all authenticated clients except sender
      this.authenticatedClients.forEach(recipient => {
        if (recipient !== client) {
          recipient.emit('message', JSON.stringify({
            type: 'secure_message',
            from: CryptoUtils.arrayBufferToBase64(this.clientToPublicKey.get(client)),
            content: message.content
          }));
        }
      });
    } else {
      // Find the client with the matching public key
      const targetPublicKey = CryptoUtils.base64ToUint8Array(message.targetPublicKey);
      let targetClient = null;
      
      for (const [candidate, publicKey] of this.clientToPublicKey.entries()) {
        if (publicKey.length === targetPublicKey.length && 
            publicKey.every((byte, i) => byte === targetPublicKey[i])) {
          targetClient = candidate;
          break;
        }
      }
      
      if (targetClient) {
        targetClient.emit('message', JSON.stringify({
          type: 'secure_message',
          from: CryptoUtils.arrayBufferToBase64(this.clientToPublicKey.get(client)),
          content: message.content
        }));
      } else {
        logMessage("Target client not found");
        client.emit('message', JSON.stringify({
          type: 'error',
          message: 'Target client not found'
        }));
      }
    }
  }
}

// Enhanced WebSocket Client with authentication capabilities
class SecureWebSocketClient extends SimulatedWebSocketClient {
  constructor(url) {
    super(url);
    // Generate key pair on initialization
    this.keyPair = CryptoUtils.generateKeyPair();
    this.authenticated = false;
    logMessage("Secure client initialized with key pair");
    
    // Set up message handler
    this.on('message', (rawMessage) => {
      this.handleMessage(rawMessage);
    });
  }
  
  // Process incoming messages based on type
  handleMessage(rawMessage) {
    try {
      const message = JSON.parse(rawMessage);
      
      switch (message.type) {
        case 'challenge':
          this.handleChallenge(message);
          break;
          
        case 'auth_success':
          this.authenticated = true;
          logMessage("Authentication successful");
          this.emit('authenticated');
          break;
          
        case 'auth_failure':
          logMessage("Authentication failed:", message.message);
          break;
          
        case 'secure_message':
          this.emit('secure_message', {
            from: message.from,
            content: message.content
          });
          break;
          
        case 'error':
          logMessage("Error from server:", message.message);
          break;
          
        default:
          logMessage(`Unknown message type: ${message.type}`);
      }
    } catch (error) {
      logMessage("Error processing message:", error);
    }
  }
  
  // Handle challenge from server
  handleChallenge(challenge) {
    const nonce = CryptoUtils.base64ToUint8Array(challenge.nonce);
    
    // Sign the nonce with our private key
    const signature = CryptoUtils.sign(nonce, this.keyPair.secretKey);
    
    // Send back the auth response
    const response = {
      type: 'auth_response',
      publicKey: CryptoUtils.arrayBufferToBase64(this.keyPair.publicKey),
      signature: CryptoUtils.arrayBufferToBase64(signature)
    };
    
    this.send(JSON.stringify(response));
    logMessage("Sent authentication response");
  }
  
  // Send a secure message
  sendSecureMessage(content, targetPublicKey = null) {
    if (!this.authenticated) {
      logMessage("Cannot send message - not authenticated");
      return;
    }
    
    const message = {
      type: 'secure_message',
      content
    };
    
    if (targetPublicKey) {
      message.targetPublicKey = targetPublicKey;
    }
    
    this.send(JSON.stringify(message));
  }
  
  // Get this client's public key as Base64
  getPublicKeyBase64() {
    return CryptoUtils.arrayBufferToBase64(this.keyPair.publicKey);
  }
}

// Demonstration of secure communication
function runSecureDemo() {
  const server = new SecureWebSocketServer();
  const alice = new SecureWebSocketClient('ws://localhost:8080');
  const bob = new SecureWebSocketClient('ws://localhost:8080');
  
  // Connect clients to server
  server.addClient(alice);
  server.addClient(bob);
  
  // When Alice is authenticated, send a message
  alice.on('authenticated', () => {
    logMessage("Alice authenticated");
    
    bob.on('authenticated', ()=>{
        const bobPublicKey = bob.getPublicKeyBase64();
        alice.sendSecureMessage("Hello Bob, this is Alice!", bobPublicKey);
        logMessage("Alice sent a direct message to Bob");
    })
  });
  
  // Handle secure messages received by Bob
  bob.on('secure_message', (message) => {
    logMessage(`Bob received secure message from ${message.from}: ${message.content}`);
  });
  
  // Handle secure messages received by Alice
  alice.on('secure_message', (message) => {
    logMessage(`Alice received secure message from ${message.from}: ${message.content}`);
  });
}

function logMessage(message, ex) {
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageContainer.appendChild(messageElement);
    }
    console.log(message, ex);
}

document.getElementById('run-basic').addEventListener('click', runBasicDemo);
document.getElementById('run-secure').addEventListener('click', runSecureDemo);
```