import { Routes } from '@angular/router';
import { MovieList } from './features/catalog/movie-list/movie-list';
import { guardRol } from './core/guards/rol';
import { guardCarrito } from './core/guards/carrito';

export const routes: Routes = [
  { path: '', component: MovieList },
  {
    path: 'pelicula/:id',
    loadComponent: () =>
      import('./features/catalog/movie-detail/movie-detail').then(m => m.MovieDetail)
  },
  // Enlace anterior: se redirige al nuevo flujo de compra
  { path: 'funcion/:id/butacas', redirectTo: 'funcion/:id/compra/butacas' },
  {
    path: 'funcion/:id/compra',
    loadComponent: () => import('./features/compra/compra/compra').then(m => m.Compra),
    children: [
      { path: '', redirectTo: 'butacas', pathMatch: 'full' },
      {
        path: 'butacas',
        loadComponent: () =>
          import('./features/compra/paso-butacas/paso-butacas').then(m => m.PasoButacas)
      },
      {
        path: 'candy',
        canActivate: [guardCarrito],
        loadComponent: () =>
          import('./features/compra/paso-candy/paso-candy').then(m => m.PasoCandy)
      },
      {
        path: 'pago',
        canActivate: [guardCarrito],
        loadComponent: () =>
          import('./features/compra/paso-pago/paso-pago').then(m => m.PasoPago)
      }
    ]
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
  { path: '**', redirectTo: '' }
];
