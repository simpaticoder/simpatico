# Simple Websocket

## Client
A websocket is a browser-provided class that takes an endpoint string and provides a persistent object with 4 events (open, message, close, error) and 2 methods (send, close).
In this example we wrap the browser websocket in a simple facade that adds logging to all events, while still supporting arbitrary custom event handling (with perhaps confusing renamed events).
The only "real" code is checking open state in send(). Without that send() would through an error if you call it in an invalid state.

Note that many libraries wrap this basic functionality in a higher level abstraction, notably socket.io.

```js
class SimpleWebSocket {
    constructor(url) {
        this.ws = new WebSocket(url);
        this.setupEventHandlers();
    }
    
    setupEventHandlers() {
        this.ws.onopen = (event) => {
            console.log('✓ Connected');
            this.onConnectionOpen?.(event);
        };
        
        this.ws.onmessage = (event) => {
            console.log('📨 Received:', event.data);
            this.onMessage?.(event.data);
        };
        
        this.ws.onclose = (event) => {
            console.log('❌ Closed:', event.code, event.reason);
            this.onConnectionClose?.(event);
        };
        
        this.ws.onerror = (error) => {
            console.log('⚠️ Error:', error);
            this.onError?.(error);
        };
    }
    
    send(data) {
        if (this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(data);
            console.log('📤 Sent:', data);
        } else {
            console.log('❌ Cannot send, connection not open');
        }
    }
    
    close() {
        this.ws.close();
    }
}

// Usage
const socket = new SimpleWebSocket('wss://echo.websocket.org/');

socket.onConnectionOpen = () => {
    socket.send('Hello from client!');
};

socket.onMessage = (data) => {
    console.log('Got response:', data);
};
```

## Client WebSocket Alternatives
WebSocket is the most popular and well-supported socket library as of 2025, however at least two others exist and may be better for our purposes.
This is not so much a demo as a sketch showing how the libraries differ at a high-level.
```js
/// Traditional WebSocket - event-based, no backpressure, as above
const ws = new WebSocket('wss://example.com');
ws.onmessage = (event) => console.log(event.data);
ws.send('message');

// WebSocket Streams - stream-based
const wsStream = new WebSocketStream('wss://example.com');
const { readable, writable } = await wsStream.connection;
const reader = readable.getReader();
const writer = writable.getWriter();

// WebTransport - HTTP/3 based with streams AND datagrams
const transport = new WebTransport('https://example.com');
await transport.ready;
const stream = await transport.createUnidirectionalStream();
```
## Server
Surprisingly Node doesn't have native websocket support. However Bun does. 
The most popular library is "ws", but the most performant is "uWebSockets.js".
There are some serious trade-offs, and we'll pick ws.

### node ws

This is the simplest possible websocket server that simply broadcasts all input to all connected clients.
Note how the connection is not created by our code, but rather passed in via the connection event as the "ws" parameter.

```js
/// npm install ws
const WebSocket = require('ws');

// Create WebSocket server
const wss = new WebSocket.Server({ port: 8080 });

console.log('WebSocket server running on ws://localhost:8080');

wss.on('connection', (ws, req) => {
    console.log(`✓ New connection from ${req.socket.remoteAddress}`);

    // Send welcome message
    ws.send('Welcome to the WebSocket server!');

    // Handle messages
    ws.on('message', (data) => {
        console.log('📨 Received:', data.toString());

        // Echo back to sender
        ws.send(`Echo: ${data}`);

        // Broadcast to all other clients
        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(`Broadcast: ${data}`);
            }
        });
    });

    // Handle connection close
    ws.on('close', (code, reason) => {
        console.log(`❌ Connection closed: ${code} ${reason}`);
    });

    // Handle errors
    ws.on('error', (error) => {
        console.log('⚠️ WebSocket error:', error);
    });

    // Send periodic ping
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.ping();
        }
    }, 30000);

    ws.on('close', () => {
        clearInterval(pingInterval);
    });
});
```
### uWebSockets.js

uWebSockets.js is notable for being extremely fast, perhaps the fastest websocket implementation on the planet.
Sadly it has two big drawbacks - currently it doesn't support ES6 imports, only CommonJS (as shown in the example below).
Second, it doesn't support certificate reloading. This means that using this library would eliminate this desirable feature.
Apart from being fast, I like that it's low-level and gives you control over back-pressure management.

```js
/// npm install uWebSockets.js
const uWS = require('uWebSockets.js');

const app = uWS.App({
  // SSL options if needed
  // key_file_name: 'misc/key.pem',
  // cert_file_name: 'misc/cert.pem',
}).ws('/*', {
  /* WebSocket options */
  compression: uWS.SHARED_COMPRESSOR,
  maxCompressedSize: 64 * 1024,
  maxBackpressure: 64 * 1024,
  
  /* Handlers */
  message: (ws, message, opCode) => {
    const data = Buffer.from(message).toString();
    console.log('📨 Received:', data);
    
    // Echo back to sender
    ws.send(`Echo: ${data}`);
    
    // Broadcast to all others
    ws.publish('broadcast', `Broadcast: ${data}`);
  },
  
  open: (ws) => {
    console.log('✓ Client connected');
    
    // Subscribe to broadcast channel
    ws.subscribe('broadcast');
    
    // Send welcome message
    ws.send('Welcome to uWebSockets.js server!');
  },
  
  close: (ws, code, message) => {
    console.log('❌ Client disconnected:', code);
  },
  
  drain: (ws) => {
    console.log('🚰 WebSocket backpressure drained');
  }
  
}).listen(8080, (token) => {
  if (token) {
    console.log('🚀 uWebSockets server listening on port 8080');
  } else {
    console.log('❌ Failed to listen to port 8080');
  }
});
```

### Redbean
Instead of using node as the websocket router, we might use something else, like [redbean](https://redbean.dev) which recently [landed websocket support](https://github.com/jart/cosmopolitan/pull/1388).
Redbean is a fascinating project, promising very high performance in a very small package that can run unmodified on several operating systems, including all the major ones.
It is idiosyncratic but it fits very well with the ethos of Simpatico, and could make running a simpatico router even easier and more efficient.