// chat-window.component.ts
import { Component, input, output, ViewChild, ElementRef, effect, computed } from '@angular/core';
import { Message } from './models';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';

@Component({
  selector: 'chat-window',
  standalone: true,
  template: `
  <div class="flex flex-col h-full">
    <div class="p-3 border-b">
      <div class="font-medium truncate">{{ title() }}</div>
      <div class="text-xs text-slate-500 truncate">{{ subtitle() }}</div>
    </div>

    <div #scrollArea class="flex-1 overflow-auto p-4 space-y-2 bg-slate-50">
      @for (m of messages(); track $index) {
        <div
          [class]="m.from === 'me' ? 'flex justify-end' : 'flex justify-start'">
          <div [class]="m.from === 'me'
               ? 'max-w-[75%] rounded-xl bg-sky-600 text-white px-3 py-2 text-sm'
               : 'max-w-[75%] rounded-xl bg-white border px-3 py-2 text-sm'">
            <div class="whitespace-pre-wrap break-words">{{ m.text }}</div>
            <div class="text-[10px] opacity-70 mt-1">{{ m.sentAt | date:'shortTime' }}</div>
          </div>
        </div>
      }

    </div>

    <form (submit)="send()" class="p-3 border-t flex gap-2">
      <input [(ngModel)]="draft" name="draft" placeholder="Type a message"
             class="flex-1 rounded-md border px-3 py-2 text-sm" />
      <button class="rounded-md bg-sky-600 text-white px-4 py-2 text-sm hover:bg-sky-500">Send</button>
    </form>
  </div>
  `,
  imports: [
    DatePipe,
    FormsModule
  ],
})
export class ChatWindowComponent {
  title = input<string>('');
  subtitle = input<string>('');
  messages = input.required<Message[]>();
  submit = output<string>();
  draft = '';

  @ViewChild('scrollArea') scrollRef?: ElementRef<HTMLDivElement>;

  constructor() {
    // auto-scroll on new messages
    effect(() => {
      // read messages() to trigger effect
      this.messages();
      queueMicrotask(() => {
        const el = this.scrollRef?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  send() {
    const text = this.draft.trim();
    if (!text) return;
    this.submit.emit(text);
    this.draft = '';
  }
}
