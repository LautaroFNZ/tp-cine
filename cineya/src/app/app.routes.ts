import { Routes } from '@angular/router';
import { MovieList } from './features/catalog/movie-list/movie-list';
import { guardRol } from './core/guards/rol';
import { guardCarrito } from './core/guards/carrito';
import { guardSalidaCompra } from './core/guards/salida-compra';

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
        canDeactivate: [guardSalidaCompra],
        loadComponent: () =>
          import('./features/compra/paso-candy/paso-candy').then(m => m.PasoCandy)
      },
      {
        path: 'pago',
        canActivate: [guardCarrito],
        canDeactivate: [guardSalidaCompra],
        loadComponent: () =>
          import('./features/compra/paso-pago/paso-pago').then(m => m.PasoPago)
      }
    ]
  },
  {
    path: 'entrada/:codigo',
    loadComponent: () => import('./features/entrada/entrada/entrada').then(m => m.Entrada)
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
    path: 'cuenta',
    canActivate: [guardRol(['cliente', 'empleado', 'admin'])],
    loadComponent: () =>
      import('./features/perfil/cuenta-layout/cuenta-layout').then(m => m.CuentaLayout),
    children: [
      { path: '', redirectTo: 'detalles', pathMatch: 'full' },
      {
        path: 'detalles',
        loadComponent: () =>
          import('./features/perfil/cuenta-detalles/cuenta-detalles').then(m => m.CuentaDetalles)
      },
      {
        path: 'compras',
        loadComponent: () =>
          import('./features/perfil/cuenta-compras/cuenta-compras').then(m => m.CuentaCompras)
      }
    ]
  },
  // Enlace anterior: se redirige a la cuenta
  { path: 'configuracion', redirectTo: 'cuenta' },
  {
    path: 'admin',
    canActivate: [guardRol(['admin'])],
    loadComponent: () =>
      import('./features/admin/admin-layout/admin-layout').then(m => m.AdminLayout),
    children: [
      { path: '', redirectTo: 'peliculas', pathMatch: 'full' },
      {
        path: 'peliculas',
        loadComponent: () =>
          import('./features/admin/peliculas-admin/peliculas-admin').then(m => m.PeliculasAdmin)
      },
      {
        path: 'funciones',
        loadComponent: () =>
          import('./features/admin/panel-admin/panel-admin').then(m => m.PanelAdmin)
      },
      {
        path: 'precios',
        loadComponent: () =>
          import('./features/admin/precios-admin/precios-admin').then(m => m.PreciosAdmin)
      },
      {
        path: 'candy',
        loadComponent: () =>
          import('./features/admin/candy-admin/candy-admin').then(m => m.CandyAdmin)
      },
      {
        path: 'cupones',
        loadComponent: () =>
          import('./features/admin/cupones-admin/cupones-admin').then(m => m.CuponesAdmin)
      }
    ]
  },
  {
    path: 'empleado',
    canActivate: [guardRol(['empleado', 'admin'])],
    loadComponent: () =>
      import('./features/empleado/panel-empleado/panel-empleado').then(m => m.PanelEmpleado)
  },
  { path: '**', redirectTo: '' }
];
