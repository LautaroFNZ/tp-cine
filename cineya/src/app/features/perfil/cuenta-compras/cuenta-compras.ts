import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgTemplateOutlet, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { CompraService } from '../services/compras';
import { Compra } from '../../../core/models/compra.model';

registerLocaleData(localeEsAr);

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

  // Una compra está vigente mientras su función no haya terminado
  vigentes = computed(() =>
    this.compras()
      .filter(compra => this.esVigente(compra))
      .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))
  );
  finalizadas = computed(() => this.compras().filter(compra => !this.esVigente(compra)));

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

  esVigente(compra: Compra): boolean {
    return Date.parse(compra.fin) > Date.now();
  }

  // El código se muestra en dos grupos para leerlo mejor
  codigoFormateado(codigo: string): string {
    return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
  }

  metodoTexto(metodo: string | null): string {
    return metodo === 'wallet' ? 'Billetera virtual' : metodo === 'card' ? 'Tarjeta' : '';
  }
}