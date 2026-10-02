import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { CandyAdminService } from '../services/candy-admin';
import { FormularioProducto } from '../formulario-producto/formulario-producto';
import { CategoriaProducto, Producto } from '../../../core/models/producto.model';

registerLocaleData(localeEsAr);

@Component({
  selector: 'app-candy-admin',
  imports: [FormularioProducto, CurrencyPipe],
  templateUrl: './candy-admin.html',
  styleUrl: './candy-admin.scss'
})
export class CandyAdmin implements OnInit {
  private candyAdmin = inject(CandyAdminService);

  categorias = signal<CategoriaProducto[]>([]);
  productos = signal<Producto[]>([]);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);

  nombreCategoria = signal('');
  mensajeCategoria = signal<string | null>(null);

  formularioAbierto = signal(false);
  productoEnEdicion = signal<Producto | null>(null);

  async ngOnInit() {
    await this.cargar();
  }

  async agregarCategoria() {
    const nombre = this.nombreCategoria().trim();
    this.mensajeCategoria.set(null);
    if (!nombre) return;

    try {
      const nueva = await this.candyAdmin.crearCategoria(nombre);
      this.categorias.update(lista => [...lista, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.nombreCategoria.set('');
    } catch (error: any) {
      this.mensajeCategoria.set(
        error?.message === 'CATEGORIA_REPETIDA'
          ? 'Ya existe una categoría con ese nombre.'
          : 'No se pudo crear la categoría. Verificá que tu usuario sea administrador.'
      );
    }
  }

  async eliminarCategoria(categoria: CategoriaProducto) {
    this.mensajeCategoria.set(null);
    try {
      await this.candyAdmin.eliminarCategoria(categoria.id);
      this.categorias.update(lista => lista.filter(item => item.id !== categoria.id));
    } catch (error: any) {
      this.mensajeCategoria.set(
        error?.message === 'CATEGORIA_CON_PRODUCTOS'
          ? `No se puede eliminar "${categoria.nombre}": todavía tiene productos.`
          : 'No se pudo eliminar la categoría.'
      );
    }
  }

  nuevo() {
    this.productoEnEdicion.set(null);
    this.formularioAbierto.set(true);
  }

  editar(producto: Producto) {
    this.productoEnEdicion.set(producto);
    this.formularioAbierto.set(true);
  }

  cerrarFormulario() {
    this.formularioAbierto.set(false);
    this.productoEnEdicion.set(null);
  }

  async alGuardar() {
    this.cerrarFormulario();
    await this.cargar();
  }

  async alternarDisponibilidad(producto: Producto) {
    this.mensajeError.set(null);
    const nuevoEstado = !producto.activo;
    try {
      await this.candyAdmin.cambiarDisponibilidad(producto.id, nuevoEstado);
      this.productos.update(lista =>
        lista.map(item => (item.id === producto.id ? { ...item, activo: nuevoEstado } : item))
      );
    } catch {
      this.mensajeError.set('No se pudo cambiar la disponibilidad. Verificá que tu usuario sea administrador.');
    }
  }

  private async cargar() {
    this.mensajeError.set(null);
    try {
      const [categorias, productos] = await Promise.all([
        this.candyAdmin.listarCategorias(),
        this.candyAdmin.listarProductos()
      ]);
      this.categorias.set(categorias);
      this.productos.set(productos);
    } catch {
      this.mensajeError.set('No se pudieron cargar los datos del candy bar.');
    } finally {
      this.cargando.set(false);
    }
  }
}