import { Injectable, computed, effect, signal, WritableSignal } from '@angular/core';
import { Contact, Message } from './models';
import { StorageRepo } from './storage.service';

type ConnState = 'idle' | 'connecting' | 'open' | 'closed' | 'error';

interface Connection {
  socket?: WebSocket;
  state: WritableSignal<ConnState>;
  messages: WritableSignal<Message[]>;
  sendQueue: string[]; // messages to send while connecting
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private contacts = signal<Contact[]>(StorageRepo.loadContacts());
  private selectedUrl = signal<string | null>(null);
  private conns = new Map<string, Connection>();

  readonly selectedContact = computed(() =>
    this.contacts().find(c => c.url === this.selectedUrl()) || null
  );

  readonly visibleMessages = computed(() => {
    const url = this.selectedUrl();
    if (!url) return [];
    return this.getOrInitConn(url).messages();
  });

  constructor() {
    // Persist contacts when changed
    effect(() => StorageRepo.saveContacts(this.contacts()));
    // Persist each conversation when it changes
    effect(() => {
      for (const c of this.contacts()) {
        const conn = this.conns.get(c.url);
        if (conn) StorageRepo.saveConversation(c.url, conn.messages());
      }
    });
  }

  listContacts() { return this.contacts.asReadonly(); }
  getSelectedUrl() { return this.selectedUrl.asReadonly(); }

  selectContact(url: string) {
    this.selectedUrl.set(url);
    // clear unread for this contact
    this.updateContact(url, { unread: 0 });
    // ensure connection exists/opens
    this.getOrInitConn(url);
  }

  addContact(url: string, name?: string, photoUrl?: string) {
    if (!/^wss:\/\//i.test(url)) throw new Error('Contact URL must start with wss://');
    const existing = this.contacts().find(c => c.url === url);
    if (existing) {
      this.updateContact(url, { name, photoUrl });
      return;
    }
    const contact: Contact = { url, name, photoUrl, unread: 0, lastMessageAt: undefined };
    this.contacts.update(list => [...list, contact]);
    this.getOrInitConn(url);
  }

  updateContact(url: string, patch: Partial<Contact>) {
    this.contacts.update(list =>
      list.map(c => (c.url === url ? { ...c, ...patch } : c))
    );
  }

  removeContact(url: string) {
    // Close connection and remove
    const conn = this.conns.get(url);
    if (conn?.socket && (conn.socket.readyState === WebSocket.OPEN || conn.socket.readyState === WebSocket.CONNECTING)) {
      try { conn.socket.close(1000, 'removed'); } catch {}
    }
    this.conns.delete(url);
    this.contacts.update(list => list.filter(c => c.url !== url));
  }

  send(url: string, text: string) {
    const conn = this.getOrInitConn(url);
    const msg: Message = { id: crypto.randomUUID(), from: 'me', text, sentAt: Date.now() };
    conn.messages.update(arr => [...arr, msg]);
    this.trySend(conn, text);
    this.updateContact(url, { lastMessageAt: msg.sentAt });
  }

  getConnState(url: string): WritableSignal<ConnState> {
    return this.getOrInitConn(url).state;
  }

  // INTERNALS

  private getOrInitConn(url: string): Connection {
    let conn = this.conns.get(url);
    if (conn) return conn;

    conn = {
      state: signal<ConnState>('idle'),
      messages: signal<Message[]>(StorageRepo.loadConversation(url)),
      sendQueue: []
    };
    this.conns.set(url, conn);
    this.open(url, conn);
    return conn;
  }

  private open(url: string, conn: Connection) {
    if (conn.socket && conn.socket.readyState === WebSocket.OPEN) return;
    conn.state.set('connecting');
    const ws = new WebSocket(url);
    conn.socket = ws;

    ws.addEventListener('open', () => {
      conn.state.set('open');
      // flush queued messages
      for (const t of conn.sendQueue.splice(0)) {
        try { ws.send(t); } catch {}
      }
    });

    ws.addEventListener('message', ev => {
      // Assume server sends plain text; adapt if your protocol is JSON
      const text = typeof ev.data === 'string' ? ev.data : '';
      const msg: Message = { id: crypto.randomUUID(), from: 'them', text, sentAt: Date.now() };
      conn.messages.update(arr => [...arr, msg]);
      // bump unread if not selected
      const sel = this.selectedUrl();
      if (sel !== url) {
        const contact = this.contacts().find(c => c.url === url);
        this.updateContact(url, { unread: (contact?.unread || 0) + 1, lastMessageAt: msg.sentAt });
      } else {
        this.updateContact(url, { lastMessageAt: msg.sentAt });
      }
    });

    ws.addEventListener('close', () => {
      conn.state.set('closed');
      // Simple backoff reconnect
      setTimeout(() => this.open(url, conn!), 1500);
    });

    ws.addEventListener('error', () => {
      conn.state.set('error');
      // Will likely also get close; reconnect handled there
    });
  }

  private trySend(conn: Connection, text: string) {
    const s = conn.socket?.readyState;
    if (s === WebSocket.OPEN) {
      try { conn.socket!.send(text); } catch { conn.sendQueue.push(text); }
    } else {
      conn.sendQueue.push(text);
    }
  }
}
