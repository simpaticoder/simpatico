# WebSockets



```html
<div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: monospace;">
  <h1>socket Demo</h1>
  <button id="run-connect">Connect</button>
  <button id="run-send">Send</button>
  <pre id="message-container" style="background: #f4f4f4; padding: 15px; margin-top: 20px; height: 500px; overflow: auto; border: 1px solid #ddd;"></pre>
</div>
```

```js
import {stree} from '/s/lib/simpatico.js';
import {logHandler} from '/s/lib/handlers.js';
let n = 0;


class SimpaticoSocket {
    constructor (
        state=stree()
    ) {
        const socketUrl = window.location.toString().replace(/^http/, 'ws').split('#')[0];
        try {
            socket = new WebSocket(socketUrl);
            logMessage("ssocket created " + socketUrl);
        } catch (ex) {
            logMessage("error: ssocket creation failed", ex);
            return;
        }
  
        state.add({handler: 'send', handle: (msg, core) => socket.send(msg)});
        state.add({handler: 'close', handle: (msg, core) => socket.close(msg.code, msg.reason)});
        
        socket.onopen = event => stree.add({handle: 'open', event});
        socket.onmessage = ({msg:data}) => stree.add({handle: 'message', msg})
        socket.onerror = err => stree.add({handle: 'error', err});
        socket.onclose = ({code, reason}) => stree.add({handle: 'closed', code, reason});
    }
    
    send(msg){
        this.state.add({handle: 'send', msg});
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

let socket;
function connect(){
    socket = new SimpaticoSocket();
}
function send(){
    socket.send('hello there ' + n++);
}
// Add event listener
document.getElementById('run-connect').addEventListener('click', connect);
document.getElementById('run-send').addEventListener('click', send);
```

# The Simpatico Registration Protocol

1. Server node process starts and binds http/ws to 80
2. Client browser process starts from 80, upgrades to ws
   3. Client new WebSocket(), open() is called when ready
   4. Server new WebSocket(), open() is called when ready
5. Server challenges with a nonce server.send({challenge: nonce})
6. Client answers challenge with public key and signed nonce client.send({publicKey, response})
7. Server validates challenge response, registers public key/connection as routable, sends result server.send({publicKey, response, accepted=true}). 
   8. OR server rejects challenge, allowing client to retry N times. server.send({publicKey, response, accepted=false, retries=3, challenge: nonce1})
   9. Client answers again, step 6
10. Errors, timeouts, throttles, message length limits, handled as usual.

Note that challenge response can be used as a heartbeat.
To get this working lets create two client websockets, and treat one as a server the other as a client.
The actual server will be a simple broadcast server, the intention to move server logic to the real backend when complete.
This is a state machine, but if we keep it simple we don't need to be formal about it.

The asymmetry between client and server is as follows:
1. server binds to a wss port.
1. client creates a socket; wait for challenge in `message(challenge)`.
1. server gets the socket in a callback, `send(challenge)`.
1. client receive challenge `message(challenge)`, construct and send a response `send(challengeResponse)`.
1. server receives a response  `message(challengeResponse)`, validates and sends `send(challengeResponseValidation)`
1. client receives `message(challengeResponseValidation)` and 
   1. if valid provides a `registeredSend(msg)` method. 
   1. If invalid, then throw an exception.



```js

```