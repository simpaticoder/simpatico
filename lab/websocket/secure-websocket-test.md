---
title: Secure WebSocket Test
date: 2026-10-01
description: Exercising the secure websocket client against the server.
---

# Secure Web Socket test


```js
import SecureWebSocketClient from "/lab/websocket/SecureWebSocketClient.js";

const socket = await SecureWebSocketClient.create("alice", () => {});

console.log("registered:", socket.isRegistered);
```