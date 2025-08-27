There are a few issues with this code (naming is inconsistent with message and packet; the structure of messages is not clear enough).
However I like the simplicity of a promise-based solution; a full FSM always seemed like overkill. It's also clearer what operations
are available at each state. I'm generally not a fan of dynamic listeners, however I like the use of a temporary handler to deal with 
registration at the beginning of the lifetime. I have mixed feelings about an async constructor, and the need to pass the callback into 
the constructor rather than after construction, however the dynamic nature of this class makes that convenient.

Note that this code is currently not running. Also note that a real encrypt/decrypt stateless function pair may be quite compute intensive,
based on ec25519 keys requiring for each message (!) a) deriving the x25519 keys for sender/reciever public keys, b) computing the DH shared secret, and c) using that shared secret to do the decryption. In a real implementation it would make sense to give this socket access to a map of (remote) public keys to precomputed DH secrets, and in a form that can be persisted and rehydrated on startup. Note that the shared secrets are precisely as sensitive as the private key, so any steps taken to protect it (like password encrypted at rest) should apply to them, too.

As a matter of taste, the constructor is too long. However having ALL the initialization logic in one place compensates for this; in addition, factoring out each step into "private" methods is quite straight-forward, if that's desirable. Also note that some may object to the use of the simpler but less flexible 'onX' form of callbacks rather than "addListener(x,cb)" style, but this both keeps the code simpler and also omits flexibility we don't need, and to some extent signals that we're going to be overwriting the socket's listeners. Eventually I'd like to pass in the websocket as a parameter, to make testing easier, as well as suport injection of a logger (although this can also be handled by the caller). We may also want to expose an "onclose" callback that would basically forward from the underlying socket. In addition we may want to define a "graceful close" protocol to distinguish from unintentional closes, but it's not clear that's necessary yet. Another useful thing would be, along with passing the socket in, to build a mock websocket that supports usage by both client and server code, to facilitate testing. Note also that we will want a server version of this class that handles the other side of connection and registration steps, with the option of validating secure messaging steps (signatures, throttle, etc). 

<div style="max-width: 800px; margin: 0 auto; padding: 20px; font-family: monospace; ">
  <h1>PKI FSM Demo</h1>
  <button id="run-demo">Run Demo</button>
  <pre id="message-container" style="background: #f4f4f4; color: #1a3b5d; padding: 15px; margin-top: 20px; height: 500px; overflow: auto; border: 1px solid #ddd;"></pre>
</div>

```js
import ClientSecureWebSocket from "./ClientSecureWebSocket.js";
import MockWebSocket from "./mock-websocket.js";
import CryptoUtils from "./crypto-utils.js";

const { client, server } = MockWebSocket.createPair();
const { publicKey, privateKey } = CryptoUtils.generateKeyPair();

async function runDemo(){
    let connection;
    try{
        connection = await ClientSecureWebSocket(publicKey, privateKey, client, (err, clearMsg) => {
            logMessage("client recieved " + JSON.stringify(clearMsg));
        });
        connection.onclose = (e) => {
            logMessage("connection closed " + e);
        }
    }
    catch (e) {
        logMessage("exception while creating socket " + e);
    }
    // send an encripted message
    connection.send({to: publicKey, content: "plaintext"});
    connection.send({to: publicKey, content: "plaintext"});
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

document.getElementById('run-demo').addEventListener('click', runDemo);
```