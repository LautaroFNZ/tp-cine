import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CarritoService } from '../../../core/services/carrito';
import { ProductoService } from '../services/productos';
import { Producto } from '../../../core/models/producto.model';
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
  private carrito = inject(CarritoService);

  productos = signal<Producto[]>([]);
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

  // Cantidad elegida de cada producto (id -> cantidad)
  cantidades = computed(
    () => new Map(this.estado().items.map(item => [item.producto.id, item.cantidad] as [string, number]))
  );

  async ngOnInit() {
    try {
      this.productos.set(await this.productoService.listarDisponibles());
      // Arranca en la primera categoría, para mostrar menos productos a la vez
      const primera = this.categorias()[0];
      this.categoriaElegida.set(primera ? primera.id : null);
    } catch {
      this.mensajeError.set('No se pudieron cargar los productos.');
    } finally {
      this.cargando.set(false);
    }
  }

  cantidad(productoId: string): number {
    return this.cantidades().get(productoId) ?? 0;
  }

  agregar(producto: Producto) {
    this.carrito.agregarProducto(producto);
  }

  quitar(producto: Producto) {
    this.carrito.quitarProducto(producto.id);
  }

  volver() {
    this.router.navigate(['../butacas'], { relativeTo: this.rutaActiva });
  }

  continuar() {
    this.router.navigate(['../pago'], { relativeTo: this.rutaActiva });
  }
}