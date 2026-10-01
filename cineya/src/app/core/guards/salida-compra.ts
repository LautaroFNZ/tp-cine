import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { CarritoService } from '../services/carrito';
import { SalidaCompraService } from '../services/salida-compra';

// Se ejecuta al intentar salir del candy bar o del pago.
export const guardSalidaCompra: CanDeactivateFn<unknown> = (
  _componente,
  rutaActual,
  _estadoActual,
  estadoSiguiente
) => {
  const carrito = inject(CarritoService);
  const salida = inject(SalidaCompraService);
  const funcionId = rutaActual.parent?.paramMap.get('id') ?? '';

  // Sin reserva vigente no hay nada que perder (por ejemplo, si se agotó el tiempo o ya se pagó)
  if (!carrito.vigente(funcionId)) {
    return true;
  }

  // Pasar entre el candy bar y el pago no libera las butacas
  const url = estadoSiguiente.url;
  if (
    url.includes(`/funcion/${funcionId}/compra/candy`) ||
    url.includes(`/funcion/${funcionId}/compra/pago`)
  ) {
    return true;
  }

  // Para volver a las butacas o salir de la compra, se pregunta al usuario
  return salida.preguntar ? salida.preguntar() : true;
};