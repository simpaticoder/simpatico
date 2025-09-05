// contact-list.component.ts
import { Component, input, output, signal } from '@angular/core';
import { Contact } from './models';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'contact-list',
  standalone: true,
  template: `
  <div class="flex flex-col h-full">
    <div class="p-3 border-b">
      <form (submit)="onAdd($event)" class="flex gap-2">
        <input [(ngModel)]="newUrl" name="url" placeholder="wss://contact.example/chat"
               class="flex-1 rounded-md border px-3 py-2 text-sm"
               required pattern="^wss://.+" />
        <button class="rounded-md bg-sky-600 text-white px-3 py-2 text-sm hover:bg-sky-500">Add</button>
      </form>
    </div>

    <ul class="flex-1 overflow-auto divide-y">
      @for (c of contacts(); track c.url) {
        <li
          (click)="select.emit(c.url)"
          class="p-3 flex items-center gap-3 cursor-pointer hover:bg-slate-50">
          @if (c.photoUrl) {
            <img [src]="c.photoUrl" class="h-8 w-8 rounded-full object-cover" />
          }
          <div class="min-w-0 flex-1">
            <div class="flex items-center justify-between">
              <span class="font-medium truncate">{{ c.name || c.url }}</span>
              @if (c.unread) {
                <span class="ml-2 rounded-full bg-sky-600 text-white text-xs px-2 py-0.5">{{ c.unread }}</span>
              }
            </div>
            <div class="text-xs text-slate-500 truncate">{{ c.url }}</div>
          </div>
        </li>
      }
    </ul>
  </div>
  `,
  imports: [
    FormsModule
  ],
})
export class ContactListComponent {
  contacts = input.required<Contact[]>();
  select = output<string>();
  newUrl = '';

  onAdd(e: Event) {
    e.preventDefault();
    this.select.emit(this.newUrl.trim());
    this.newUrl = '';
  }
}
