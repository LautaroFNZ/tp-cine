import { Routes } from '@angular/router';
import { MovieList } from './features/catalog/movie-list/movie-list';

export const routes: Routes = [
  { path: '', component: MovieList },
  {
    path: 'pelicula/:id',
    loadComponent: () =>
      import('./features/catalog/movie-detail/movie-detail').then(m => m.MovieDetail)
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then(m => m.Login)
  },
  {
    path: 'registro',
    loadComponent: () => import('./features/auth/registro/registro').then(m => m.Registro)
  },
];