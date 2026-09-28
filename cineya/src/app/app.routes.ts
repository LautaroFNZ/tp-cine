import { Routes } from '@angular/router';
import { MovieList } from './features/catalog/movie-list/movie-list';

export const routes: Routes = [
  { path: '', component: MovieList },
  {
    path: 'pelicula/:id',
    loadComponent: () =>
      import('./features/catalog/movie-detail/movie-detail').then(m => m.MovieDetail)
  },
];