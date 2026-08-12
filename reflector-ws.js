// ============================================================
// WebSockets
// ============================================================

startWebSockets(server) {
    if (!this.config.enableWebsockets || !server) {
        return;
    }

    const seed = randomBytes(32).toString("hex");
    const serverKeys = SecureWebSocketServer.generateKeys(seed);

    new WebSocketServer({
        server,
        perMessageDeflate: true,
    }).on("connection", (ws) => this.chatServerLogic(ws, serverKeys));
}

async chatServerLogic(ws, serverKeys) {
    try {
        const secureSocket = await SecureWebSocketServer.create(
            ws,
            serverKeys,
            1000,
        );

        if (hasProp(this.connections, secureSocket.publicKey)) {
            secureSocket.socket.send(
                JSON.stringify({
                    error: "SOCKET_ALREADY_REGISTERED",
                }),
            );

            secureSocket.close();
            return;
        }

        this.registerSocket(secureSocket);

        secureSocket.onclose = (event) =>
            this.unregisterSocket(secureSocket, event);

        secureSocket.onerror = (event) =>
            this.unregisterSocket(secureSocket, event);

        secureSocket.onsecuremessage = (envelope, socket) =>
            this.messageRouter(envelope, socket);
    } catch (err) {
        console.error(err);
    }
}

registerSocket(secureSocket) {
    this.connections[secureSocket.publicKey] = secureSocket;
}

unregisterSocket(secureSocket, event) {
    debug(
        `unregister socket called for key: ${
            secureSocket.publicKey
        } for reason ${event?.type}`,
    );

    secureSocket.isRegistered = false;

    delete this.connections[secureSocket.publicKey];
}

messageRouter(envelope, actualFromSocket) {
    const { type, from, to, message } = envelope;

    const fromSocket = this.connections[from];

    const toSocket = this.connections[to];

    if (!fromSocket) {
        actualFromSocket.send(
            JSON.stringify({
                ...envelope,
                error: "SOCKET_NOT_REGISTERED",
            }),
        );
        return;
    }

    if (fromSocket !== actualFromSocket) {
        actualFromSocket.send(
            JSON.stringify({
                ...envelope,
                error: "MISMATCHED_SOCKET_PUBLIC_KEY",
            }),
        );
        return;
    }

    if (message === undefined) {
        actualFromSocket.send(
            JSON.stringify({
                ...envelope,
                error: "MISSING_CONTENT_FIELD",
            }),
        );
        return;
    }

    if (type !== "MESSAGE") {
        actualFromSocket.send(
            JSON.stringify({
                ...envelope,
                error: "MISSING_TYPE_MESSAGE",
            }),
        );
        return;
    }

    if (!toSocket) {
        actualFromSocket.send(
            JSON.stringify({
                ...message,
                error: "RECIPIENT_NOT_AVAILABLE",
            }),
        );
        return;
    }

    toSocket.send(message);

    actualFromSocket.send(
        JSON.stringify({
            ...message,
            type: "MESSAGE_DELIVERED",
        }),
    );
}