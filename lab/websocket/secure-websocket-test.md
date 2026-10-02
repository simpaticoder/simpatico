# Secure Web Socket test


```js
import SecureWebSocketClient from "/lab/websocket/SecureWebSocketClient.js";

const socket = await SecureWebSocketClient.create("alice", () => {});

console.log("registered:", socket.isRegistered);
```