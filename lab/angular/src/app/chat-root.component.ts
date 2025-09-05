import { Component, computed, signal, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChatService } from './chat.service';
import { ContactListComponent } from './contact-list.component';
import { ChatWindowComponent } from './chat-window.component';

@Component({
  selector: 'chat-root',
  standalone: true,
  imports: [FormsModule, ContactListComponent, ChatWindowComponent, NgClass],
  template: `
  <div class="h-screen flex bg-white text-slate-800">
    <!-- Sidebar -->
    <aside class="w-80 border-r flex flex-col">
      <div class="p-3 text-sm font-semibold">Contacts</div>
      <contact-list
        [contacts]="contacts()"
        (select)="onSelectOrAdd($event)"
      />
    </aside>

    <!-- Main -->
    <main class="flex-1 flex flex-col">
      @if (selected()) {
        <div class="flex items-center justify-between p-3 border-b">
          <div class="flex items-center gap-3 min-w-0">
            @if (selected()?.photoUrl) {
              <img [src]="selected()?.photoUrl" class="h-8 w-8 rounded-full object-cover"  alt="contact photo"/>
            }
            <div class="min-w-0">
              <div class="font-medium truncate">{{ selected()?.name || selected()?.url }}</div>
              <div class="text-xs text-slate-500 truncate">
                {{ selected()?.url }}
                <span class="ml-2"
                  [ngClass]="{
                    'text-emerald-600': connState() === 'open',
                    'text-amber-600': connState() === 'connecting',
                    'text-rose-600': connState() === 'error' || connState() === 'closed'
                  }">• {{ connState() }}</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <button (click)="editMeta()" class="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50">Edit</button>
            <button (click)="remove()" class="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50">Remove</button>
          </div>
        </div>

        <chat-window
          class="flex-1"
          [title]="selected()?.name || selected()?.url || ''"
          [subtitle]="selected()?.url || ''"
          [messages]="messages()"
          (submit)="send($event)"
        />
      } @else {
        <div class="flex-1 grid place-items-center">
          <div class="text-center text-slate-500">
            <div class="font-medium">No contact selected</div>
            <div class="text-sm">Add or select a contact on the left</div>
          </div>
        </div>
      }
    </main>
  </div>
  `,
  styles: ''
})
export class ChatRootComponent {
  private chat = inject(ChatService);

  contacts = this.chat.listContacts();
  selected = this.chat.selectedContact;
  messages = this.chat.visibleMessages;
  connState = computed(() => {
    const url = this.chat.getSelectedUrl()();
    return url ? this.chat.getConnState(url)() : 'idle';
  });

  onSelectOrAdd(url: string) {
    const exists = this.contacts().some(c => c.url === url);
    if (!exists) {
      this.chat.addContact(url);
    }
    this.chat.selectContact(url);
  }

  send(text: string) {
    const sel = this.chat.getSelectedUrl()();
    if (sel) this.chat.send(sel, text);
  }

  editMeta() {
    const sel = this.selected();
    if (!sel) return;
    const name = prompt('Display name', sel.name || '') ?? sel.name;
    const photoUrl = prompt('Photo URL (optional)', sel.photoUrl || '') ?? sel.photoUrl;
    this.chat.updateContact(sel.url, { name: name || undefined, photoUrl: photoUrl || undefined });
  }

  remove() {
    const sel = this.selected();
    if (!sel) return;
    if (confirm(`Remove contact ${sel.name || sel.url}?`)) {
      this.chat.removeContact(sel.url);
    }
  }
}
