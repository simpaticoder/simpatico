import {Component, computed, signal} from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [],
  template: `
    <div class="min-h-screen grid place-items-center bg-slate-50 text-slate-800 p-6">
      <div class="w-full max-w-sm rounded-xl bg-white shadow p-5 space-y-4">
        <h1 class="text-base font-semibold">Counter</h1>

        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-lg border p-3 text-center">
            <div class="text-xs uppercase tracking-wide text-slate-500">Count</div>
            <div class="mt-1 text-2xl font-bold tabular-nums">{{ count() }}</div>
          </div>
          <div class="rounded-lg border p-3 text-center">
            <div class="text-xs uppercase tracking-wide text-slate-500">Double</div>
            <div class="mt-1 text-2xl font-bold tabular-nums">{{ doubleCount() }}</div>
          </div>
        </div>

        <button
          (click)="updateCount()"
          class="w-full rounded-lg bg-sky-600 text-white py-2.5 font-medium hover:bg-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500 transition"
          aria-label="Increment count"
        >
          + Increment
        </button>
      </div>
    </div>

  `,
  styles: ''
})
export class AppComponent {
  count = signal(1);
  doubleCount= computed(()=>this.count() * 2)
  updateCount = () => {
    this.count.update(count => count + 1)
  }
}
