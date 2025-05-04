export default class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url, protocols = [], options = { delay: 0 }) {
        this.url = url;
        this.protocols = protocols;
        this.delay = options.delay;
        this.readyState = MockWebSocket.CONNECTING;
        this.bufferedAmount = 0;
        this.extensions = '';
        this.protocol = '';
        this._pairedSocket = null;

        // Event handlers
        this.onopen = null;
        this.onmessage = null;
        this.onclose = null;
        this.onerror = null;

        // Auto-connect
        setTimeout(() => this._simulateOpen(), this.delay);
    }

    _simulateOpen() {
        if (this.readyState === MockWebSocket.CONNECTING) {
            this.readyState = MockWebSocket.OPEN;
            if (this.onopen) {
                this.onopen(new Event('open'));
            }
        }
    }

    send(data) {
        if (this.readyState !== MockWebSocket.OPEN) {
            throw new Error('WebSocket is not open');
        }

        // Simulate increasing bufferedAmount
        this.bufferedAmount += data.length || 0;

        // If this socket is paired, deliver the message to its pair
        if (this._pairedSocket && this._pairedSocket.readyState === MockWebSocket.OPEN) {
            setTimeout(() => {
                this.bufferedAmount = Math.max(0, this.bufferedAmount - (data.length || 0));
                if (this._pairedSocket.onmessage) {
                    const messageEvent = new MessageEvent('message', {
                        data, // the only field we really care about
                        origin: this._pairedSocket.url,
                        lastEventId: '',
                        source: null,
                        ports: []
                    });
                    this._pairedSocket.onmessage(messageEvent);
                }
            }, this.delay);
        }

        return true;
    }

    close(code = 1000, reason = '') {
        if (this.readyState === MockWebSocket.CLOSED) return;

        if (this.readyState === MockWebSocket.OPEN) {
            this.readyState = MockWebSocket.CLOSING;

            // If paired, notify the other socket that this one is closing
            if (this._pairedSocket && this._pairedSocket.readyState === MockWebSocket.OPEN) {
                this._pairedSocket.mockServerClose(code, reason);
            }

            setTimeout(() => {
                this.readyState = MockWebSocket.CLOSED;
                if (this.onclose) {
                    const closeEvent = new CloseEvent('close', {
                        code,
                        reason,
                        wasClean: true
                    });
                    this.onclose(closeEvent);
                }
            }, this.delay);
        }
    }

    // Test helper methods (not in real WebSocket API)

    // Simulate receiving a message from the server
    mockReceive(data) {
        if (this.readyState === MockWebSocket.OPEN && this.onmessage) {
            const messageEvent = new MessageEvent('message', {
                data,
                origin: this.url,
                lastEventId: '',
                source: null,
                ports: []
            });
            this.onmessage(messageEvent);
        }
    }

    // Simulate server-initiated close
    mockServerClose(code = 1000, reason = '') {
        if (this.readyState === MockWebSocket.OPEN) {
            this.readyState = MockWebSocket.CLOSING;

            setTimeout(() => {
                this.readyState = MockWebSocket.CLOSED;
                if (this.onclose) {
                    const closeEvent = new CloseEvent('close', {
                        code,
                        reason,
                        wasClean: true
                    });
                    this.onclose(closeEvent);
                }
            }, this.delay);
        }
    }

    // Simulate a connection error
    mockError() {
        if (this.readyState !== MockWebSocket.CLOSED) {
            if (this.onerror) {
                this.onerror(new Event('error'));
            }
            this.close(1006, 'Connection error');
        }
    }

    // Helper method to immediately open the connection (for testing)
    mockConnectImmediately() {
        if (this.readyState === MockWebSocket.CONNECTING) {
            this._simulateOpen();
        }
    }

    // Connect this socket to another mock socket so they can communicate
    pairWith(otherSocket) {
        this._pairedSocket = otherSocket;
        otherSocket._pairedSocket = this;
        return this;
    }

    // Static method to create a connected pair of sockets
    static createPair(options = { delay: 0 }) {
        const clientSocket = new MockWebSocket('ws://client', [], options);
        const serverSocket = new MockWebSocket('ws://server', [], options);

        clientSocket.pairWith(serverSocket);

        return {
            client: clientSocket,
            server: serverSocket
        };
    }
}

// For environments that don't have these event types
if (typeof CloseEvent === 'undefined') {
    class CloseEvent extends Event {
        constructor(type, options = {}) {
            super(type);
            this.code = options.code || 1000;
            this.reason = options.reason || '';
            this.wasClean = options.wasClean || false;
        }
    }
    globalThis.CloseEvent = CloseEvent;
}

if (typeof MessageEvent === 'undefined') {
    class MessageEvent extends Event {
        constructor(type, options = {}) {
            super(type);
            this.data = options.data;
            this.origin = options.origin || '';
            this.lastEventId = options.lastEventId || '';
            this.source = options.source || null;
            this.ports = options.ports || [];
        }
    }
    globalThis.MessageEvent = MessageEvent;
}

// Example usage
// const { client, server } = MockWebSocket.createPair();
//
// // Set up handlers for the client socket
// client.onopen = () => console.log('Client connected');
// client.onmessage = (event) => console.log('Client received:', event.data);
// client.onclose = () => console.log('Client connection closed');
//
// // Set up handlers for the server socket
// server.onopen = () => console.log('Server connected');
// server.onmessage = (event) => {
//     console.log('Server received:', event.data);
//     // Echo back the message
//     server.send(`Echo: ${event.data}`);
// };
// server.onclose = () => console.log('Server connection closed');
//
// // Send a message from client to server
// client.send('Hello from client!');
//
// // Later, close the connection
// client.close();