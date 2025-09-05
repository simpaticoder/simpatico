import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home.component').then(m => m.HomeComponent),
  },
  {
    path: 'counter',
    loadComponent: () => import('./increment.component').then(m => m.IncrementComponent),
  },
  {
    path: 'chat',
    loadComponent: () => import('./chat-root.component').then(m => m.ChatRootComponent),
  },
  { path: '**', redirectTo: '' },
];
