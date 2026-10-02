# Simpatico Chat

End-to-end encrypted peer-to-peer chat for up to 4 peers. Each browser tab generates an ephemeral X25519 keypair. Share your invite link to add peers.

## How to test

1. Open this page — it generates your address.
2. Click **Open invite in new tab** repeatedly to add up to 4 peers.
3. Type in any peer's window and hit Enter or click Send.

Messages are encrypted with ECDH-derived shared secrets. The server routes by public key but cannot read contents. All state is ephemeral.

---

<style>
  #chat-app { font-family: sans-serif; max-width: 900px; margin: 20px auto; padding: 0 12px; }
  #identity { background: #f5f5f5; border-radius: 8px; padding: 12px; margin-bottom: 12px; font-size: 14px; }
  #identity strong { display: block; margin-bottom: 4px; word-break: break-all; }
  #identity a { color: #0645ad; text-decoration: none; }
  #identity a:hover { text-decoration: underline; }
  #identity button { margin-top: 8px; margin-right: 8px; padding: 6px 12px; cursor: pointer; }
  #status { font-size: 12px; color: #666; margin-top: 4px; }
  #system-messages { font-size: 12px; color: #a44; min-height: 18px; margin-bottom: 8px; }

  #peer-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  @media (max-width: 640px) {
    #peer-grid { grid-template-columns: 1fr; }
  }

  .peer-window {
    border: 1px solid #ddd;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    height: 280px;
    background: #fff;
  }
  .peer-header {
    background: #f5f5f5;
    padding: 6px 10px;
    font-weight: bold;
    font-size: 13px;
    border-bottom: 1px solid #ddd;
    border-radius: 8px 8px 0 0;
  }
  .peer-messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    font-size: 13px;
  }
  .peer-messages .msg { margin: 3px 0; line-height: 1.4; }
  .peer-messages .who { font-weight: bold; font-size: 12px; }
  .peer-messages .who.me { color: #2a7; }
  .peer-messages .who.them { color: #27a; }
  .peer-messages .system { color: #888; font-style: italic; font-size: 12px; }

  .peer-input-row {
    display: flex;
    gap: 4px;
    padding: 6px;
    border-top: 1px solid #ddd;
  }
  .peer-input-row input {
    flex: 1;
    padding: 5px 8px;
    font-size: 13px;
    border: 1px solid #ccc;
    border-radius: 4px;
  }
  .peer-input-row button {
    padding: 5px 12px;
    font-size: 13px;
    cursor: pointer;
    border-radius: 4px;
    border: 1px solid #ccc;
  }
</style>

<div id="chat-app">
  <div id="identity">
    <strong id="my-key">Loading…</strong>
    <a id="invite-link" href="#" target="_blank">Open invite in new tab</a>
    <button id="copy-btn">Copy invite link</button>
    <div id="status">Connecting…</div>
  </div>
  <div id="system-messages"></div>
  <div id="peer-grid"></div>
</div>

<script type="module">
  import * as crypto from './websocket/crypto.js';
  import SecureWebSocketClient from './websocket/SecureWebSocketClient.js';

  const myKeyEl = document.getElementById('my-key');
  const inviteLinkEl = document.getElementById('invite-link');
  const copyBtn = document.getElementById('copy-btn');
  const statusEl = document.getElementById('status');
  const systemMsgEl = document.getElementById('system-messages');
  const peerGrid = document.getElementById('peer-grid');

  const NAMES = ['Alice','Bob','Charlie','Diana','Eve','Frank','Grace','Henry','Ivy','Jack','Kate','Leo','Mary','Nate','Olive','Pete','Quinn','Rose','Sam','Tom','Ursula','Victor','Wendy','Xavier','Yara','Zack'];
  const MY_NAME = 'me';

  function nameForKey(keyString) {
    const bytes = crypto.decode(keyString);
    const idx = ((bytes[0] << 8) | bytes[1]) % NAMES.length;
    return NAMES[idx];
  }

  function updateStatus() {
    const count = Object.keys(peers).length;
    statusEl.textContent = `${myName} · ${count} peer(s)`;
  }

  function addSystemMessage(text) {
    systemMsgEl.textContent = text;
    setTimeout(() => { if (systemMsgEl.textContent === text) systemMsgEl.textContent = ''; }, 5000);
  }

  const MAX_PEERS = 4;
  const peers = {}; // publicKeyString -> { contact, el, messagesEl, inputEl }

  function getOrCreatePeerWindow(contact) {
    const key = contact.publicKeyString;
    if (peers[key]) return peers[key];
    if (Object.keys(peers).length >= MAX_PEERS) {
      const err = 'Max 4 peers reached — rejecting ' + (contact.name || key.slice(0, 12));
      console.error('[chat]', err);
      addSystemMessage(err);
      return null;
    }

    const win = document.createElement('div');
    win.className = 'peer-window';
    win.dataset.peerKey = key;
    win.innerHTML = `
      <div class="peer-header">${contact.name || nameForKey(key)}</div>
      <div class="peer-messages"></div>
      <div class="peer-input-row">
        <input type="text" placeholder="Type a message…" disabled>
        <button class="peer-send" disabled>Send</button>
      </div>
    `;

    const input = win.querySelector('input');
    const sendBtn = win.querySelector('.peer-send');
    const messages = win.querySelector('.peer-messages');

    const sendHandler = () => {
      const text = input.value.trim();
      if (!text) return;
      if (sendPayload(contact, { text })) {
        addPeerMessage(key, MY_NAME, text);
        input.value = '';
        input.focus();
      }
    };

    sendBtn.addEventListener('click', sendHandler);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') sendHandler(); });

    peerGrid.appendChild(win);
    peers[key] = { contact, el: win, messagesEl: messages, inputEl: input };
    return peers[key];
  }

  function addPeerMessage(key, who, text, cls = '') {
    const peer = peers[key];
    if (!peer) return;
    const div = document.createElement('div');
    div.className = 'msg' + (cls ? ' ' + cls : '');
    if (cls === 'system') {
      div.textContent = text;
    } else {
      const nameSpan = document.createElement('span');
      nameSpan.className = 'who ' + (who === MY_NAME ? 'me' : 'them');
      nameSpan.textContent = who + ':';
      const textSpan = document.createElement('span');
      textSpan.className = 'text';
      textSpan.textContent = ' ' + text;
      div.appendChild(nameSpan);
      div.appendChild(textSpan);
    }
    peer.messagesEl.appendChild(div);
    peer.messagesEl.scrollTop = peer.messagesEl.scrollHeight;
  }

  function sendPayload(contact, payload) {
    console.debug('[chat] sendPayload to', contact?.name || contact?.publicKeyString?.slice(0, 16), payload);
    if (!client || !client.isRegistered) {
      addSystemMessage('Not connected');
      return false;
    }
    try {
      client.send(contact, payload);
      return true;
    } catch (e) {
      console.debug('[chat] sendPayload error:', e.message);
      addSystemMessage('Send failed: ' + e.message);
      return false;
    }
  }

  // If opened from an invite link, the hash contains the inviter's key
  const inviterKey = window.location.hash.slice(1);

  // Generate ephemeral identity
  const keys = crypto.generateEncryptionKeys();
  const user = {
    publicKeyString: keys.publicKeyString,
    privateKeyBits: keys.privateKeyBits,
    contacts: {}
  };
  const myName = nameForKey(keys.publicKeyString);
  document.title = 'Simpatico Chat — ' + myName;

  // Set my own public key in the URL hash
  window.location.hash = keys.publicKeyString;

  myKeyEl.textContent = `You are ${myName} · ${keys.publicKeyString.slice(0, 16)}…`;

  const baseUrl = window.location.href.split('#')[0];
  const inviteUrl = baseUrl + '#' + keys.publicKeyString;
  inviteLinkEl.href = inviteUrl;

  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => copyBtn.textContent = 'Copy invite link', 1500);
    });
  });

  // If invited, prepare the inviter as a send target
  let inviterContact = null;
  if (inviterKey && inviterKey !== keys.publicKeyString) {
    try {
      const pub = crypto.decode(inviterKey);
      const secret = crypto.deriveSharedSecret(user.privateKeyBits, pub);
      inviterContact = {
        publicKeyString: inviterKey,
        publicKeyBits: pub,
        sharedSecret: secret,
        name: nameForKey(inviterKey)
      };
      console.debug('[chat] prepared inviterContact:', inviterContact.name);
    } catch (e) {
      console.error('[chat] Invalid inviter key', e);
    }
  }

  // Connect
  let client;
  try {
    client = await SecureWebSocketClient.create(user, (err, data) => {
      console.debug('[chat] onmessage. err:', err?.message, 'data:', data);
      if (err) {
        addSystemMessage(err.message);
        return;
      }
      if (data.type === 'MESSAGE') {
        const contact = data.from;
        const msg = data.message;

        if (!contact.name) contact.name = nameForKey(contact.publicKeyString);

        if (msg.type === 'INVITE') {
          if (msg.name) contact.name = msg.name;
          const peer = getOrCreatePeerWindow(contact);
          if (!peer) return;
          peer.inputEl.disabled = false;
          peer.el.querySelector('.peer-send').disabled = false;
          addPeerMessage(contact.publicKeyString, '', `${contact.name} invited you to chat`, 'system');
          sendPayload(contact, { type: 'ACCEPT', name: myName });
        } else if (msg.type === 'ACCEPT') {
          if (msg.name) contact.name = msg.name;
          const peer = getOrCreatePeerWindow(contact);
          if (!peer) return;
          peer.inputEl.disabled = false;
          peer.el.querySelector('.peer-send').disabled = false;
          addPeerMessage(contact.publicKeyString, '', `${contact.name} accepted your invitation`, 'system');
        } else if (msg.text) {
          const peer = getOrCreatePeerWindow(contact);
          if (!peer) return;
          peer.inputEl.disabled = false;
          peer.el.querySelector('.peer-send').disabled = false;
          addPeerMessage(contact.publicKeyString, contact.name, msg.text);
        }

        updateStatus();
      }
    });

    console.debug('[chat] connected. isRegistered:', client.isRegistered);
    updateStatus();

    // If we opened from an invite link, send an invitation back
    if (inviterContact) {
      console.debug('[chat] sending INVITE to inviter:', inviterContact.name);
      sendPayload(inviterContact, { type: 'INVITE', name: myName });
      addSystemMessage(`Invitation sent to ${inviterContact.name} — waiting for acceptance`);
    }

  } catch (e) {
    statusEl.textContent = 'Connection failed: ' + e.message;
    console.error('[chat] Connection failed:', e);
  }
</script>
