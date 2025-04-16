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
let socket;
let n = 0;
function websocketConnect() {
    const socketUrl = window.location.toString().replace(/^http/, 'ws').split('#')[0];
    try {
        socket = new WebSocket(socketUrl);
        logMessage("socket created " + socketUrl);
    } catch (ex) {
        logMessage("error: socket creation failed", ex);
        return;
    }
    
    socket.addEventListener("open",(e) => {
        logMessage("socket opened");
    });
    socket.addEventListener("message",(e) => {
        logMessage("socket.message recieved: " + e.data)
    });
}

function websocketSend() {
    const msg = "hello " + n++;
    try{
        socket.send(msg);
        logMessage("socket.message send: " + msg);
    } catch (ex) {
        logMessage("socket.send failed " + ex);
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