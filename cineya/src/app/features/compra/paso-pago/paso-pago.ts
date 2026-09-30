import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { CarritoService } from '../../../core/services/carrito';
import { ButacaService } from '../services/butacas';
import { ResumenCompra } from '../resumen-compra/resumen-compra';

@Component({
  selector: 'app-paso-pago',
  imports: [ResumenCompra, RouterLink],
  templateUrl: './paso-pago.html',
  styleUrl: './paso-pago.scss'
})
export class PasoPago {
  private router = inject(Router);
  private rutaActiva = inject(ActivatedRoute);
  private carrito = inject(CarritoService);
  private butacaService = inject(ButacaService);

  pagando = signal(false);
  compraId = signal<string | null>(null);
  mensajeError = signal<string | null>(null);

  volver() {
    this.router.navigate(['../candy'], { relativeTo: this.rutaActiva });
  }

  async pagar() {
    const estado = this.carrito.valor;
    if (!estado.funcionId || estado.butacas.length === 0) return;

    this.pagando.set(true);
    this.mensajeError.set(null);
    try {
      const compraId = await this.butacaService.comprar(
        estado.funcionId,
        estado.butacas.map(butaca => butaca.id)
      );
      this.compraId.set(compraId);
      this.carrito.vaciar();
    } catch (error: any) {
      if (error?.message === 'RESERVA_VENCIDA') {
        this.mensajeError.set('Tu reserva venció. Volvé al mapa para elegir las butacas de nuevo.');
      } else {
        this.mensajeError.set('No se pudo completar la compra. Probá de nuevo.');
      }
    } finally {
      this.pagando.set(false);
    }
  }
}
