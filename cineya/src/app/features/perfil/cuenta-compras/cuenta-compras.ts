import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgTemplateOutlet, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { CreditoService } from '../../../core/services/credito';
import { CompraService } from '../services/compras';
import { Compra } from '../../../core/models/compra.model';
import { DialogoAviso } from '../../../shared/components/dialogo-aviso/dialogo-aviso';
import { IncluyeComboPipe } from '../../../shared/pipes/incluye-combo-pipe';

registerLocaleData(localeEsAr);

type EstadoCompra = 'vigente' | 'utilizada' | 'finalizada' | 'cancelada';

// Se puede cancelar hasta 2 horas antes de la función
const MARGEN_CANCELACION = 2 * 60 * 60 * 1000;

@Component({
  selector: 'app-cuenta-compras',
  imports: [CurrencyPipe, DatePipe, NgTemplateOutlet, RouterLink, DialogoAviso, IncluyeComboPipe],
  templateUrl: './cuenta-compras.html',
  styleUrl: './cuenta-compras.scss'
})
export class CuentaCompras implements OnInit {
  private auth = inject(AuthService);
  private compraService = inject(CompraService);
  private creditoService = inject(CreditoService);

  @ViewChild('avisoCancelar', { static: true }) avisoCancelar!: DialogoAviso;

  compras = signal<Compra[]>([]);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);

  // Cancelación de una compra
  compraACancelar = signal<Compra | null>(null);
  cancelando = signal(false);
  mensajeExito = signal<string | null>(null);
  mensajeAccion = signal<string | null>(null);

  // Vigente: todavía se puede usar. Anteriores: ya se usó la entrada, terminó la función o se canceló.
  vigentes = computed(() =>
    this.compras()
      .filter(compra => this.estadoDe(compra) === 'vigente')
      .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
  );
  anteriores = computed(() => this.compras().filter(compra => this.estadoDe(compra) !== 'vigente'));

  async ngOnInit() {
    await this.auth.listo;
    if (!this.auth.sesion()?.user.id) {
      this.mensajeError.set('Iniciá sesión para ver tus compras.');
      this.cargando.set(false);
      return;
    }
    await this.cargar();
  }

  // Cancelada: el usuario la canceló. Utilizada: ya se escaneó la entrada.
  // Finalizada: la función terminó sin usarse. Vigente: se puede usar todavía.
  estadoDe(compra: Compra): EstadoCompra {
    if (compra.cancelada) return 'cancelada';
    if (compra.entradaUsada) return 'utilizada';
    return Date.parse(compra.fin) > Date.now() ? 'vigente' : 'finalizada';
  }

  textoEstado(estado: EstadoCompra): string {
    const textos: Record<EstadoCompra, string> = {
      vigente: 'Vigente',
      utilizada: 'Utilizada',
      finalizada: 'Finalizada',
      cancelada: 'Cancelada'
    };
    return textos[estado];
  }

  // Los productos del candy tienen su propio estado, porque se retiran por separado
  candyPendiente(compra: Compra): boolean {
    return !compra.cancelada && !compra.candyEntregado && Date.parse(compra.fin) > Date.now();
  }

  // ¿La compra tiene algo para retirar en el candy bar? (productos sueltos o combos)
  tieneCandy(compra: Compra): boolean {
    return compra.productos.length > 0 || (compra.combos?.length ?? 0) > 0;
  }

  textoCandy(compra: Compra): string {
    if (compra.candyEntregado) return 'Candy retirado';
    return this.candyPendiente(compra) ? 'Candy pendiente' : 'Candy sin retirar';
  }

  // Se puede cancelar si no se usó nada y faltan más de 2 horas para la función
  puedeCancelar(compra: Compra): boolean {
    return (
      !compra.cancelada &&
      !compra.entradaUsada &&
      !compra.candyEntregado &&
      Date.now() <= Date.parse(compra.inicio) - MARGEN_CANCELACION
    );
  }

  // Hasta cuándo se puede cancelar
  limiteCancelacion(compra: Compra): Date {
    return new Date(Date.parse(compra.inicio) - MARGEN_CANCELACION);
  }

  async cancelar(compra: Compra) {
    this.mensajeExito.set(null);
    this.mensajeAccion.set(null);
    this.compraACancelar.set(compra);

    const acepto = await this.avisoCancelar.preguntar();
    if (!acepto) return;

    this.cancelando.set(true);
    try {
      const monto = await this.creditoService.cancelarCompra(compra.id);
      this.mensajeExito.set(
        `Cancelaste tu compra de ${compra.pelicula}. Se acreditaron ${this.moneda(monto)} en tu cuenta.`
      );
      await this.cargar();
    } catch (error: any) {
      const mensajes: Record<string, string> = {
        FUERA_DE_PLAZO: 'Ya no se puede cancelar: faltan menos de 2 horas para la función.',
        YA_UTILIZADA: 'Esta compra ya se utilizó y no se puede cancelar.',
        YA_CANCELADA: 'Esta compra ya estaba cancelada.',
        SIN_SESION: 'Iniciá sesión para cancelar una compra.'
      };
      this.mensajeAccion.set(mensajes[error?.message] ?? 'No se pudo cancelar la compra. Probá de nuevo.');
      await this.cargar();
    } finally {
      this.cancelando.set(false);
    }
  }

  // El código se muestra en dos grupos para leerlo mejor
  codigoFormateado(codigo: string): string {
    return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
  }

  metodoTexto(metodo: string | null): string {
    const textos: Record<string, string> = { wallet: 'Billetera virtual', card: 'Tarjeta', credit: 'Crédito' };
    return metodo ? (textos[metodo] ?? '') : '';
  }

  private moneda(valor: number): string {
    return `$ ${valor.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
  }

  private async cargar() {
    const usuarioId = this.auth.sesion()?.user.id;
    if (!usuarioId) return;

    try {
      this.compras.set(await this.compraService.listarDelUsuario(usuarioId));
      this.mensajeError.set(null);
    } catch {
      this.mensajeError.set('No se pudieron cargar tus compras.');
    } finally {
      this.cargando.set(false);
    }
  }
}