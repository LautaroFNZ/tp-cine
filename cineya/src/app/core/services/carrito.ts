import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Butaca } from '../models/butaca.model';
import { PreciosFuncion } from '../models/precios.model';
import { Producto } from '../models/producto.model';
import { Recompensa } from '../models/recompensa.model';

export interface ItemCarrito {
  producto: Producto;
  cantidad: number;
}

// Una recompensa que el usuario eligió canjear con puntos
export interface ItemCanje {
  recompensa: Recompensa;
  cantidad: number;
}

// Descuento que calculó la base de datos para la compra en curso
export interface Descuento {
  etiqueta: string;
  porcentaje: number;
  monto: number;
}

// Crédito de la cuenta del usuario: cuánto tiene y si decidió usarlo en esta compra
export interface CreditoCompra {
  saldo: number;
  usar: boolean;
}

export interface EstadoCarrito {
  funcionId: string | null;
  butacas: Butaca[];
  items: ItemCarrito[];
  canjes: ItemCanje[];
  descuento: Descuento | null;
  credito: CreditoCompra;
  precios: PreciosFuncion | null;
  vence: number | null;   // instante (en milisegundos) en que vence la reserva
}

const VACIO: EstadoCarrito = {
  funcionId: null,
  butacas: [],
  items: [],
  canjes: [],
  descuento: null,
  credito: { saldo: 0, usar: false },
  precios: null,
  vence: null
};

@Injectable({ providedIn: 'root' })
export class CarritoService {
  private estado = new BehaviorSubject<EstadoCarrito>(VACIO);
  readonly estado$ = this.estado.asObservable();
  // Indica que la compra ya se pagó, para que el indicador de pasos marque el último como completo
  private compraRealizada = new BehaviorSubject<boolean>(false);
  readonly compraRealizada$ = this.compraRealizada.asObservable();
  private seleccionPrevia: { funcionId: string; ids: string[] } | null = null;
  private itemsPrevios: { funcionId: string; items: ItemCarrito[] } | null = null;

  get valor(): EstadoCarrito {
    return this.estado.value;
  }

  iniciar(funcionId: string, butacas: Butaca[], precios: PreciosFuncion | null, segundos: number) {
    this.compraRealizada.next(false);
    const actual = this.valor;
    // Los productos elegidos se conservan si se vuelve a reservar para la misma función
    const items =
      actual.funcionId === funcionId
        ? actual.items
        : this.itemsPrevios?.funcionId === funcionId
          ? this.itemsPrevios.items
          : [];
    this.itemsPrevios = null;
    // Los canjes y el crédito se eligen en el pago, así que cada reserva nueva empieza sin ellos
    this.estado.next({
      funcionId,
      butacas,
      items,
      canjes: [],
      descuento: null,
      credito: { saldo: 0, usar: false },
      precios,
      vence: Date.now() + segundos * 1000
    });
  }

  vaciar() {
    this.itemsPrevios = null;
    this.estado.next(VACIO);
  }

  establecerCompraRealizada(realizada: boolean) {
    this.compraRealizada.next(realizada);
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

  // Productos del candy bar. Al cambiar el pedido, el descuento calculado deja de valer
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
    this.estado.next({ ...actual, items, descuento: null });
  }

  quitarProducto(productoId: string) {
    const actual = this.valor;
    const items = actual.items
      .map(item => (item.producto.id === productoId ? { ...item, cantidad: item.cantidad - 1 } : item))
      .filter(item => item.cantidad > 0);
    this.estado.next({ ...actual, items, descuento: null });
  }

  // Canjes con puntos
  cantidadDeCanje(recompensaId: string): number {
    return this.valor.canjes.find(item => item.recompensa.id === recompensaId)?.cantidad ?? 0;
  }

  agregarCanje(recompensa: Recompensa) {
    const actual = this.valor;
    const existe = actual.canjes.some(item => item.recompensa.id === recompensa.id);
    const canjes = existe
      ? actual.canjes.map(item =>
          item.recompensa.id === recompensa.id ? { ...item, cantidad: item.cantidad + 1 } : item
        )
      : [...actual.canjes, { recompensa, cantidad: 1 }];
    this.estado.next({ ...actual, canjes, descuento: null });
  }

  quitarCanje(recompensaId: string) {
    const actual = this.valor;
    const canjes = actual.canjes
      .map(item => (item.recompensa.id === recompensaId ? { ...item, cantidad: item.cantidad - 1 } : item))
      .filter(item => item.cantidad > 0);
    this.estado.next({ ...actual, canjes, descuento: null });
  }

  // Puntos que cuestan todos los canjes elegidos
  puntosCanjeados(estado: EstadoCarrito): number {
    return estado.canjes.reduce((suma, item) => suma + item.recompensa.puntos * item.cantidad, 0);
  }

  // Cuántas entradas gratis se eligieron canjear
  entradasCanjeadas(estado: EstadoCarrito): number {
    return estado.canjes
      .filter(item => item.recompensa.tipo === 'entrada')
      .reduce((suma, item) => suma + item.cantidad, 0);
  }

  establecerDescuento(descuento: Descuento | null) {
    this.estado.next({ ...this.valor, descuento });
  }

  // Crédito de la cuenta
  establecerSaldoCredito(saldo: number) {
    const actual = this.valor;
    this.estado.next({ ...actual, credito: { ...actual.credito, saldo } });
  }

  usarCredito(usar: boolean) {
    const actual = this.valor;
    this.estado.next({ ...actual, credito: { ...actual.credito, usar } });
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

  // Lo que valen las entradas canjeadas con puntos: se descuenta el precio base
  // (el recargo de una butaca VIP se paga aparte)
  creditoEntradasCanjeadas(estado: EstadoCarrito): number {
    return (estado.precios?.precioBase ?? 0) * this.entradasCanjeadas(estado);
  }

  // Entradas y productos que se pagan, sin descuento
  subtotal(estado: EstadoCarrito): number {
    return (
      this.totalButacas(estado) - this.creditoEntradasCanjeadas(estado) + this.totalProductos(estado)
    );
  }

  // Valor de la compra: el subtotal menos el descuento
  total(estado: EstadoCarrito): number {
    return this.subtotal(estado) - (estado.descuento?.monto ?? 0);
  }

  // Cuánto del total se cubre con el crédito de la cuenta (si el usuario decidió usarlo)
  creditoAplicado(estado: EstadoCarrito): number {
    if (!estado.credito.usar) return 0;
    return Math.max(0, Math.min(estado.credito.saldo, this.total(estado)));
  }

  // Lo que queda por pagar con tarjeta o billetera
  aPagar(estado: EstadoCarrito): number {
    return this.total(estado) - this.creditoAplicado(estado);
  }
}