import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { CarritoService } from '../services/carrito';

export const guardCarrito: CanActivateFn = (route) => {
  const carrito = inject(CarritoService);
  const router = inject(Router);
  const funcionId = route.parent?.paramMap.get('id') ?? '';

  if (carrito.vigente(funcionId)) {
    return true;
  }
  return router.createUrlTree(['/funcion', funcionId, 'compra', 'butacas']);
};
