
# Plan

See [crypto](../crypto.md)

<div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: monospace; ">
  <h1>PKI FSM Demo</h1>
  <button id="run-demo">Run Demo</button>
  <pre id="message-container" style="background: #f4f4f4; color: #1a3b5d; padding: 15px; margin-top: 20px; height: 500px; overflow: auto; border: 1px solid #ddd;"></pre>
</div>


```js
import {PKIServer, PKIClient, MessageBus} from './websocket-fsm.js'

// Demonstration of secure communication using PKI and FSM
function runDemo() {
    logMessage('Demo: Started');
    const bus = new MessageBus();
    
    const server = new PKIServer(bus, logMessage);
    const alice = new PKIClient('Alice', bus, logMessage);
    const bob = new PKIClient('Bob', bus, logMessage);
    
    alice.on('authenticated', () => {
        logMessage('Demo: Alice authenticated');

        // its safer to poll  because bob may already be authenticated
        const checkInterval = setInterval(() => {
            if (bob.state === 'authenticated') {
                clearInterval(checkInterval);
                alice.sendMessage('Hello Bob, this is Alice!', bob.publicKeyB64);
            }
        }, 100);
    });

    bob.on('message', (message) => {
        logMessage(`Bob received message from ${message.from}: ${message.content}`);
        bob.sendMessage('Hello Alice, this is Bob!', alice.publicKeyB64);
        
    });

    alice.on('message', (message) => {
        logMessage(`Alice received message from ${message.from}: ${message.content}`);
    });

    // Connect clients
    alice.connect();
    bob.connect();

    // Return cleanup function
    return () => {
        alice.disconnect();
        bob.disconnect();
        server.shutdown();
    };
}

function logMessage(message) {
    const container = document.getElementById('message-container');
    if (container) {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        container.appendChild(messageElement);
    }
    console.log(message);
}

document.getElementById('run-demo').addEventListener('click', () => {
    const cleanup = runDemo();
    // Cleanup after 5 seconds for demo purposes
    setTimeout(cleanup, 5000);
});
```
