# WebSockets

Exercising the basic [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/socket).

```html
<div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: monospace;">
  <h1>socket Demo</h1>
  <button id="run-connect">Connect</button>
  <button id="run-send">Send</button>
  <pre id="message-container" style="background: #f4f4f4; padding: 15px; margin-top: 20px; height: 500px; overflow: auto; border: 1px solid #ddd;"></pre>
</div>
```

```js
import { createAuthClient } from './client.js';

async function runClient() {
    // In a real app, keys would be securely generated and stored
    const keys = {
        publicKey: 'client-public-key-1',
        privateKey: 'client-private-key-1'
    };

    const socketUrl = window.location.toString().replace(/^http/, 'ws').split('#')[0];
    // Create and configure client
    const client = createAuthClient(socketUrl, keys);

    // Connect and authenticate
    try {
        await client.connect();
        logMessage('Connected to server');

        // Start authentication
        client.authenticate();

        // Listen for authentication result
        client.onStateChange((newState) => {
            if (newState === 'AUTHENTICATED') {
                logMessage('Successfully authenticated!');
                // Now you can send authenticated messages
            } else if (newState === 'REJECTED') {
                logMessage('Authentication rejected');
            }
        });
    } catch (error) {
        logMessage('Connection failed:', error);
    }
}

/**
 * Helper function to log messages to the UI
 */
function logMessage(message, ex) {
    const messageContainer = document.getElementById('message-container');
    if (messageContainer) {
        const messageElement = document.createElement('div');
        messageElement.textContent = message;
        messageContainer.appendChild(messageElement);
    }
    console.log(message, ex);
}

// Add event listener
document.getElementById('run-connect').addEventListener('click', websocketConnect);
document.getElementById('run-send').addEventListener('click', websocketSend);
```

```js
/// DO NOT RUN Server-side example (Node.js)
// server-main.js
import { createAuthServer } from './server.js';

async function runServer() {
    // Create and start server
    const server = createAuthServer({ port: 3000 });
    server.start();

    console.log('Server running. Press Ctrl+C to stop.');
}


```