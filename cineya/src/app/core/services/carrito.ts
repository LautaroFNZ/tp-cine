import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Butaca } from '../models/butaca.model';
import { PreciosFuncion } from '../models/precios.model';
import { Producto } from '../models/producto.model';

export interface ItemCarrito {
  producto: Producto;
  cantidad: number;
}

export interface EstadoCarrito {
  funcionId: string | null;
  butacas: Butaca[];
  items: ItemCarrito[];
  precios: PreciosFuncion | null;
  vence: number | null;   // instante (en milisegundos) en que vence la reserva
}

const VACIO: EstadoCarrito = { funcionId: null, butacas: [], items: [], precios: null, vence: null };

@Injectable({ providedIn: 'root' })
export class CarritoService {
  private estado = new BehaviorSubject<EstadoCarrito>(VACIO);
  readonly estado$ = this.estado.asObservable();
  private seleccionPrevia: { funcionId: string; ids: string[] } | null = null;
  private itemsPrevios: { funcionId: string; items: ItemCarrito[] } | null = null;

  get valor(): EstadoCarrito {
    return this.estado.value;
  }

  iniciar(funcionId: string, butacas: Butaca[], precios: PreciosFuncion | null, segundos: number) {
    const actual = this.valor;
    // Los productos elegidos se conservan si se vuelve a reservar para la misma función
    const items =
      actual.funcionId === funcionId
        ? actual.items
        : this.itemsPrevios?.funcionId === funcionId
          ? this.itemsPrevios.items
          : [];
    this.itemsPrevios = null;
    this.estado.next({ funcionId, butacas, items, precios, vence: Date.now() + segundos * 1000 });
  }

  vaciar() {
    this.itemsPrevios = null;
    this.estado.next(VACIO);
  }

  // Suelta la reserva pero recuerda las butacas y los productos elegidos
  soltar() {
    const actual = this.valor;
    if (actual.funcionId) {
      this.seleccionPrevia = { funcionId: actual.funcionId, ids: actual.butacas.map(butaca => butaca.id) };
      this.itemsPrevios = { funcionId: actual.funcionId, items: actual.items };
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

  // Productos del candy bar
  cantidadDe(productoId: string): number {
    return this.valor.items.find(item => item.producto.id === productoId)?.cantidad ?? 0;
  }

  agregarProducto(producto: Producto) {
    const actual = this.valor;
    const existe = actual.items.some(item => item.producto.id === producto.id);
    const items = existe
      ? actual.items.map(item =>
          item.producto.id === producto.id ? { ...item, cantidad: item.cantidad + 1 } : item
        )
      : [...actual.items, { producto, cantidad: 1 }];
    this.estado.next({ ...actual, items });
  }

  quitarProducto(productoId: string) {
    const actual = this.valor;
    const items = actual.items
      .map(item => (item.producto.id === productoId ? { ...item, cantidad: item.cantidad - 1 } : item))
      .filter(item => item.cantidad > 0);
    this.estado.next({ ...actual, items });
  }

  // Precios y totales
  precioDe(butaca: Butaca, precios: PreciosFuncion | null): number {
    if (!precios) return 0;
    return precios.precioBase + (butaca.tipo === 'vip' ? precios.recargoVip : 0);
  }

  totalButacas(estado: EstadoCarrito): number {
    return estado.butacas.reduce((suma, butaca) => suma + this.precioDe(butaca, estado.precios), 0);
  }

  totalProductos(estado: EstadoCarrito): number {
    return estado.items.reduce((suma, item) => suma + item.producto.precio * item.cantidad, 0);
  }

  total(estado: EstadoCarrito): number {
    return this.totalButacas(estado) + this.totalProductos(estado);
  }
}