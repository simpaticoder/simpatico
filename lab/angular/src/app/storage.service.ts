// storage.ts
import {Contact, Message} from './models';

const LS_CONTACTS = 'chat.contacts.v1';
const LS_CONVO_PREFIX = 'chat.convo.v1:'; // + contactUrl

export const StorageRepo = {
  loadContacts(): Contact[] {
    try { return JSON.parse(localStorage.getItem(LS_CONTACTS) || '[]'); } catch { return []; }
  },
  saveContacts(contacts: Contact[]) {
    localStorage.setItem(LS_CONTACTS, JSON.stringify(contacts));
  },
  loadConversation(url: string): Message[] {
    try { return JSON.parse(localStorage.getItem(LS_CONVO_PREFIX + url) || '[]'); } catch { return []; }
  },
  saveConversation(url: string, messages: Message[]) {
    localStorage.setItem(LS_CONVO_PREFIX + url, JSON.stringify(messages));
  }
};
