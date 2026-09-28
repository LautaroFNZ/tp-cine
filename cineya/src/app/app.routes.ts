import { Routes } from '@angular/router';
import { MovieList } from './features/catalog/movie-list/movie-list';
import { guardRol } from './core/guards/rol';

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
  {
    path: 'configuracion',
    canActivate: [guardRol(['cliente', 'empleado', 'admin'])],
    loadComponent: () =>
      import('./features/perfil/configuracion/configuracion').then(m => m.Configuracion)
  },
  {
    path: 'admin',
    canActivate: [guardRol(['admin'])],
    loadComponent: () =>
      import('./features/admin/panel-admin/panel-admin').then(m => m.PanelAdmin)
  },
  {
    path: 'empleado',
    canActivate: [guardRol(['empleado', 'admin'])],
    loadComponent: () =>
      import('./features/empleado/panel-empleado/panel-empleado').then(m => m.PanelEmpleado)
  },
  { path: '**', redirectTo: '' },
];