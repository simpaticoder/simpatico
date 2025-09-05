import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'home-screen',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="min-h-screen grid place-items-center bg-slate-50 text-slate-800 p-6">
      <div class="w-full max-w-sm rounded-xl bg-white shadow p-6 space-y-4">
        <h1 class="text-lg font-semibold text-center">Choose a demo</h1>
        <div class="grid gap-3">
          <a
            routerLink="/counter"
            class="block rounded-lg border px-4 py-3 text-center hover:bg-slate-50"
          >
            Increment (Counter)
          </a>
          <a
            routerLink="/chat"
            class="block rounded-lg border px-4 py-3 text-center hover:bg-slate-50"
          >
            Chat
          </a>
        </div>
      </div>
    </div>
  `,
})
export class HomeComponent {}
