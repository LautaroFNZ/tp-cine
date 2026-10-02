import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgTemplateOutlet, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { CompraService } from '../services/compras';
import { Compra } from '../../../core/models/compra.model';

registerLocaleData(localeEsAr);

type EstadoCompra = 'vigente' | 'utilizada' | 'finalizada';

@Component({
  selector: 'app-cuenta-compras',
  imports: [CurrencyPipe, DatePipe, NgTemplateOutlet, RouterLink],
  templateUrl: './cuenta-compras.html',
  styleUrl: './cuenta-compras.scss'
})
export class CuentaCompras implements OnInit {
  private auth = inject(AuthService);
  private compraService = inject(CompraService);

  compras = signal<Compra[]>([]);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);

  // Vigente: todavía se puede usar. Anteriores: ya se usó la entrada o terminó la función.
  vigentes = computed(() =>
    this.compras()
      .filter(compra => this.estadoDe(compra) === 'vigente')
      .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
  );
  anteriores = computed(() => this.compras().filter(compra => this.estadoDe(compra) !== 'vigente'));

  async ngOnInit() {
    await this.auth.listo;
    const usuarioId = this.auth.sesion()?.user.id;
    if (!usuarioId) {
      this.mensajeError.set('Iniciá sesión para ver tus compras.');
      this.cargando.set(false);
      return;
    }

    try {
      this.compras.set(await this.compraService.listarDelUsuario(usuarioId));
    } catch {
      this.mensajeError.set('No se pudieron cargar tus compras.');
    } finally {
      this.cargando.set(false);
    }
  }

  // Utilizada: ya se escaneó la entrada. Finalizada: la función terminó sin usarse.
  // Vigente: la función no terminó y la entrada todavía no se usó.
  estadoDe(compra: Compra): EstadoCompra {
    if (compra.entradaUsada) return 'utilizada';
    return Date.parse(compra.fin) > Date.now() ? 'vigente' : 'finalizada';
  }

  textoEstado(estado: EstadoCompra): string {
    return estado === 'vigente' ? 'Vigente' : estado === 'utilizada' ? 'Utilizada' : 'Finalizada';
  }

  // Los productos del candy tienen su propio estado, porque se retiran por separado
  candyPendiente(compra: Compra): boolean {
    return !compra.candyEntregado && Date.parse(compra.fin) > Date.now();
  }

  textoCandy(compra: Compra): string {
    if (compra.candyEntregado) return 'Candy retirado';
    return this.candyPendiente(compra) ? 'Candy pendiente' : 'Candy sin retirar';
  }

  // El código se muestra en dos grupos para leerlo mejor
  codigoFormateado(codigo: string): string {
    return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
  }

  metodoTexto(metodo: string | null): string {
    return metodo === 'wallet' ? 'Billetera virtual' : metodo === 'card' ? 'Tarjeta' : '';
  }
}