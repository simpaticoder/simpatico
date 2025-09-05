// models.ts
export interface Contact {
  url: string;
  name?: string;
  photoUrl?: string;
  unread?: number;
  lastMessageAt?: number;
}

export interface Message {
  id: string;
  from: 'me' | 'them';
  text: string;
  sentAt: number; // epoch ms
}
