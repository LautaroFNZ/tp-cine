import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Butaca } from '../models/butaca.model';
import { PreciosFuncion } from '../models/precios.model';

export interface EstadoCarrito {
  funcionId: string | null;
  butacas: Butaca[];
  precios: PreciosFuncion | null;
  vence: number | null;   // instante (en milisegundos) en que vence la reserva
}

const VACIO: EstadoCarrito = { funcionId: null, butacas: [], precios: null, vence: null };

@Injectable({ providedIn: 'root' })
export class CarritoService {
  private estado = new BehaviorSubject<EstadoCarrito>(VACIO);
  readonly estado$ = this.estado.asObservable();
  private seleccionPrevia: { funcionId: string; ids: string[] } | null = null;

  get valor(): EstadoCarrito {
    return this.estado.value;
  }

  iniciar(funcionId: string, butacas: Butaca[], precios: PreciosFuncion | null, segundos: number) {
    this.estado.next({ funcionId, butacas, precios, vence: Date.now() + segundos * 1000 });
  }

  vaciar() {
    this.estado.next(VACIO);
  }

  // Suelta la reserva pero recuerda qué butacas había elegido, para volver a marcarlas en el mapa
  soltar() {
    const actual = this.valor;
    if (actual.funcionId) {
      this.seleccionPrevia = { funcionId: actual.funcionId, ids: actual.butacas.map(butaca => butaca.id) };
    }
    this.estado.next(VACIO);
  }

  // Devuelve la selección recordada (una sola vez) si corresponde a esta función
  recuperarSeleccionPrevia(funcionId: string): string[] {
    const previa = this.seleccionPrevia;
    this.seleccionPrevia = null;
    return previa && previa.funcionId === funcionId ? previa.ids : [];
  }

  // ¿Hay una reserva vigente para esta función?
  vigente(funcionId: string): boolean {
    const actual = this.valor;
    return (
      actual.funcionId === funcionId &&
      actual.butacas.length > 0 &&
      actual.vence !== null &&
      actual.vence > Date.now()
    );
  }

  precioDe(butaca: Butaca, precios: PreciosFuncion | null): number {
    if (!precios) return 0;
    return precios.precioBase + (butaca.tipo === 'vip' ? precios.recargoVip : 0);
  }

  total(estado: EstadoCarrito): number {
    return estado.butacas.reduce((suma, butaca) => suma + this.precioDe(butaca, estado.precios), 0);
  }
}