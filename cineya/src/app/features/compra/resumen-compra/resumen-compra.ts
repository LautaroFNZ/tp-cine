import { Component, inject } from '@angular/core';
import { AsyncPipe, CurrencyPipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { CarritoService } from '../../../core/services/carrito';

registerLocaleData(localeEsAr);

@Component({
  selector: 'app-resumen-compra',
  imports: [AsyncPipe, CurrencyPipe],
  templateUrl: './resumen-compra.html',
  styleUrl: './resumen-compra.scss'
})
export class ResumenCompra {
  carrito = inject(CarritoService);
  carrito$ = this.carrito.estado$;
}
