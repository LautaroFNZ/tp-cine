import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { RouterLink } from '@angular/router';
import { CreditoService } from '../../../core/services/credito';
import { MovimientoCredito } from '../../../core/models/credito.model';

registerLocaleData(localeEsAr);

@Component({
  selector: 'app-cuenta-credito',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './cuenta-credito.html',
  styleUrl: './cuenta-credito.scss'
})
export class CuentaCredito implements OnInit {
  private creditoService = inject(CreditoService);

  saldo = signal(0);
  movimientos = signal<MovimientoCredito[]>([]);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);

  async ngOnInit() {
    try {
      const [saldo, movimientos] = await Promise.all([
        this.creditoService.obtenerSaldo(),
        this.creditoService.listarMovimientos()
      ]);
      this.saldo.set(saldo);
      this.movimientos.set(movimientos);
    } catch {
      this.mensajeError.set('No se pudo cargar tu crédito.');
    } finally {
      this.cargando.set(false);
    }
  }

  codigoFormateado(codigo: string): string {
    return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
  }
}