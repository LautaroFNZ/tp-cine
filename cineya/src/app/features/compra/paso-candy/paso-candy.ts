import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CarritoService } from '../../../core/services/carrito';
import { ProductoService } from '../services/productos';
import { ComboService } from '../services/combos';
import { Producto } from '../../../core/models/producto.model';
import { Combo } from '../../../core/models/combo.model';
import { ResumenCompra } from '../resumen-compra/resumen-compra';

registerLocaleData(localeEsAr);

@Component({
  selector: 'app-paso-candy',
  imports: [CurrencyPipe, ResumenCompra],
  templateUrl: './paso-candy.html',
  styleUrl: './paso-candy.scss'
})
export class PasoCandy implements OnInit {
  private router = inject(Router);
  private rutaActiva = inject(ActivatedRoute);
  private productoService = inject(ProductoService);
  private comboService = inject(ComboService);
  private carrito = inject(CarritoService);

  productos = signal<Producto[]>([]);
  combos = signal<Combo[]>([]);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);
  categoriaElegida = signal<number | null>(null);   // null = todas

  // El carrito es un BehaviorSubject; toSignal lo convierte en un signal para usarlo acá
  private estado = toSignal(this.carrito.estado$, { initialValue: this.carrito.valor });

  // Solo aparecen las categorías que tienen productos disponibles
  categorias = computed(() => {
    const vistas = new Map<number, string>();
    for (const producto of this.productos()) {
      vistas.set(producto.categoriaId, producto.categoria);
    }
    return [...vistas.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre));
  });

  productosVisibles = computed(() => {
    const id = this.categoriaElegida();
    return id === null ? this.productos() : this.productos().filter(p => p.categoriaId === id);
  });

  // Cantidad elegida de cada producto y de cada combo (id -> cantidad)
  cantidades = computed(
    () => new Map(this.estado().items.map(item => [item.producto.id, item.cantidad] as [string, number]))
  );
  cantidadesCombo = computed(
    () => new Map(this.estado().combos.map(item => [item.combo.id, item.cantidad] as [string, number]))
  );

  // Entradas (butacas elegidas) que todavía no están cubiertas por un combo ni por una entrada gratis
  entradasLibres = computed(() => this.carrito.entradasLibres(this.estado()));

  async ngOnInit() {
    // Los combos son un extra: si no se pueden cargar, igual se ofrecen los productos
    this.comboService
      .listarDisponibles()
      .then(combos => this.combos.set(combos))
      .catch(() => this.combos.set([]));

    try {
      this.productos.set(await this.productoService.listarDisponibles());
    } catch {
      this.mensajeError.set('No se pudieron cargar los productos.');
    } finally {
      this.cargando.set(false);
    }
  }

  cantidad(productoId: string): number {
    return this.cantidades().get(productoId) ?? 0;
  }

  cantidadCombo(comboId: string): number {
    return this.cantidadesCombo().get(comboId) ?? 0;
  }

  puedeAgregarCombo(combo: Combo): boolean {
    return this.entradasLibres() >= combo.entradasIncluidas;
  }

  // Lo que se ahorra comprando el combo en lugar de cada cosa por separado
  ahorro(combo: Combo): number {
    const precioBase = this.estado().precios?.precioBase ?? 0;
    const separado =
      precioBase * combo.entradasIncluidas +
      combo.incluye.reduce((suma, item) => suma + item.precio * item.cantidad, 0);
    return Math.max(0, separado - combo.precio);
  }

  agregar(producto: Producto) {
    this.carrito.agregarProducto(producto);
  }

  quitar(producto: Producto) {
    this.carrito.quitarProducto(producto.id);
  }

  agregarCombo(combo: Combo) {
    this.carrito.agregarCombo(combo);
  }

  quitarCombo(combo: Combo) {
    this.carrito.quitarCombo(combo.id);
  }

  volver() {
    this.router.navigate(['../butacas'], { relativeTo: this.rutaActiva });
  }

  continuar() {
    this.router.navigate(['../pago'], { relativeTo: this.rutaActiva });
  }
}