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
import {SecureWebSocketServer, SecureWebSocketClient, logMessage} from './websocket-plan.js'

// Demonstration of secure communication
function runSecureDemo() {
  const server = new SecureWebSocketServer();
  const alice = new SecureWebSocketClient('ws://localhost:8080', 'alice');
  const bob = new SecureWebSocketClient('ws://localhost:8080', 'bob');
  
  // Connect clients to server
  server.addClient(alice);
  server.addClient(bob);
  
  // When Alice and Bob are authenticated, send a message from Alice to Bob
  alice.on('authenticated', () => {
    logMessage(`${alice.name} authenticated`);
    
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


document.getElementById('run-secure').addEventListener('click', runSecureDemo);
```

```js
import {SimulatedWebSocketServer, SimulatedWebSocketClient, logMessage} from './websocket-plan.js'
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
document.getElementById('run-basic').addEventListener('click', runBasicDemo);
```