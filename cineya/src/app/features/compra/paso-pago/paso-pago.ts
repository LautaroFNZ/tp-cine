import { Component, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CarritoService } from '../../../core/services/carrito';
import { ButacaService } from '../services/butacas';
import { ResumenCompra } from '../resumen-compra/resumen-compra';

registerLocaleData(localeEsAr);

type MetodoPago = 'card' | 'wallet';

@Component({
  selector: 'app-paso-pago',
  imports: [ResumenCompra, RouterLink, CurrencyPipe],
  templateUrl: './paso-pago.html',
  styleUrl: './paso-pago.scss'
})
export class PasoPago {
  private router = inject(Router);
  private rutaActiva = inject(ActivatedRoute);
  private carrito = inject(CarritoService);
  private butacaService = inject(ButacaService);

  metodos: { valor: MetodoPago; texto: string }[] = [
    { valor: 'card', texto: 'Tarjeta de crédito o débito' },
    { valor: 'wallet', texto: 'Billetera virtual' }
  ];
  metodo = signal<MetodoPago>('card');

  pagando = signal(false);
  codigo = signal<string | null>(null);
  totalPagado = signal(0);
  mensajeError = signal<string | null>(null);

  // El código se muestra en dos grupos para leerlo mejor
  codigoFormateado = computed(() => {
    const codigo = this.codigo();
    return codigo ? `${codigo.slice(0, 5)}-${codigo.slice(5)}` : '';
  });

  volver() {
    this.router.navigate(['../candy'], { relativeTo: this.rutaActiva });
  }

  async pagar() {
    const estado = this.carrito.valor;
    if (!estado.funcionId || estado.butacas.length === 0) return;

    this.pagando.set(true);
    this.mensajeError.set(null);
    try {
      // Pago simulado: una espera corta para que se note el procesamiento
      await new Promise(resolver => setTimeout(resolver, 1500));

      const total = this.carrito.total(estado);
      const resultado = await this.butacaService.comprar(
        estado.funcionId,
        estado.butacas.map(butaca => butaca.id),
        estado.items.map(item => ({ productoId: item.producto.id, cantidad: item.cantidad })),
        this.metodo()
      );

      this.totalPagado.set(total);
      this.codigo.set(resultado.codigo);
      this.carrito.vaciar();
      this.carrito.establecerCompraRealizada(true);
    } catch (error: any) {
      if (error?.message === 'RESERVA_VENCIDA') {
        this.mensajeError.set('Tu reserva venció. Volvé al mapa para elegir las butacas de nuevo.');
      } else if (error?.message === 'PRODUCTO_NO_DISPONIBLE') {
        this.mensajeError.set('Alguno de los productos ya no está disponible. Volvé al candy bar y revisá tu elección.');
      } else {
        this.mensajeError.set('No se pudo completar la compra. Probá de nuevo.');
      }
    } finally {
      this.pagando.set(false);
    }
  }
}