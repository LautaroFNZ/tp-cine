import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { RouterLink } from '@angular/router';
import { PuntosService } from '../../../core/services/puntos';
import { MovimientoPuntos, Recompensa } from '../../../core/models/recompensa.model';

registerLocaleData(localeEsAr);

@Component({
  selector: 'app-cuenta-puntos',
  imports: [DatePipe, DecimalPipe, RouterLink],
  templateUrl: './cuenta-puntos.html',
  styleUrl: './cuenta-puntos.scss'
})
export class CuentaPuntos implements OnInit {
  private puntosService = inject(PuntosService);

  saldo = signal(0);
  recompensas = signal<Recompensa[]>([]);
  movimientos = signal<MovimientoPuntos[]>([]);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);

  canjes = computed(() => this.movimientos().filter(movimiento => movimiento.tipo === 'canjeado'));
  ganados = computed(() => this.movimientos().filter(movimiento => movimiento.tipo === 'ganado'));
  ajustes = computed(() => this.movimientos().filter(movimiento => movimiento.tipo === 'ajuste'));

  async ngOnInit() {
    try {
      const [saldo, recompensas, movimientos] = await Promise.all([
        this.puntosService.obtenerSaldo(),
        this.puntosService.listarRecompensas(),
        this.puntosService.listarMovimientos()
      ]);
      this.saldo.set(saldo);
      this.recompensas.set(recompensas);
      this.movimientos.set(movimientos);
    } catch {
      this.mensajeError.set('No se pudieron cargar tus puntos.');
    } finally {
      this.cargando.set(false);
    }
  }

  // Cuántos puntos le faltan para poder canjear la recompensa
  faltan(recompensa: Recompensa): number {
    return Math.max(0, recompensa.puntos - this.saldo());
  }

  codigoFormateado(codigo: string): string {
    return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
  }
}