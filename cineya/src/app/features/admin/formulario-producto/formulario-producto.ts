import {
  Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject, signal
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { form, FormField, min, required, submit } from '@angular/forms/signals';
import { CandyAdminService } from '../services/candy-admin';
import { CategoriaProducto, Producto } from '../../../core/models/producto.model';
import { SelectorImagen, SeleccionImagen } from '../../../shared/components/selector-imagen/selector-imagen';

interface DatosProducto {
  nombre: string;
  descripcion: string;
  categoriaId: string;   // '' = sin elegir
  precio: number;
}

@Component({
  selector: 'app-formulario-producto',
  imports: [FormField, NgTemplateOutlet, SelectorImagen],
  templateUrl: './formulario-producto.html',
  styleUrl: './formulario-producto.scss'
})
export class FormularioProducto implements OnChanges {
  // Producto a editar; null = alta de un producto nuevo
  @Input() producto: Producto | null = null;
  @Input() categorias: CategoriaProducto[] = [];
  @Output() guardado = new EventEmitter<void>();
  @Output() cancelado = new EventEmitter<void>();

  private candyAdmin = inject(CandyAdminService);

  modelo = signal<DatosProducto>({ nombre: '', descripcion: '', categoriaId: '', precio: 0 });

  formulario = form(this.modelo, (campos) => {
    required(campos.nombre, { message: 'El nombre es obligatorio' });
    required(campos.categoriaId, { message: 'Elegí una categoría' });
    min(campos.precio, 1, { message: 'El precio tiene que ser mayor a 0' });
  });

  imagen = signal<SeleccionImagen>({ archivo: null, enlace: '', valido: true });
  imagenActual = signal('');

  guardando = signal(false);
  mensajeError = signal<string | null>(null);

  // Solo se recarga cuando cambia el producto (no cuando cambia la lista de categorías)
  ngOnChanges(cambios: SimpleChanges) {
    if (cambios['producto']) {
      this.cargar();
    }
  }

  alElegirImagen(seleccion: SeleccionImagen) {
    this.imagen.set(seleccion);
  }

  alEnviar(evento: Event) {
    evento.preventDefault();
    this.mensajeError.set(null);

    submit(this.formulario, {
      action: async () => {
        const datos = this.modelo();
        const imagen = this.imagen();

        if (!imagen.valido) {
          this.mensajeError.set('Revisá la imagen elegida.');
          return;
        }

        this.guardando.set(true);
        try {
          let imagenUrl = this.producto?.imagenUrl ?? null;
          if (imagen.archivo) {
            imagenUrl = await this.candyAdmin.subirImagen(imagen.archivo);
          } else if (imagen.enlace) {
            imagenUrl = imagen.enlace;
          }

          await this.candyAdmin.guardarProducto(
            {
              nombre: datos.nombre.trim(),
              descripcion: datos.descripcion.trim(),
              categoriaId: Number(datos.categoriaId),
              precio: datos.precio,
              imagenUrl
            },
            this.producto?.id
          );
          this.guardado.emit();
        } catch {
          this.mensajeError.set('No se pudo guardar el producto. Verificá que tu usuario sea administrador.');
        } finally {
          this.guardando.set(false);
        }
      }
    });
  }

  private cargar() {
    const p = this.producto;
    this.mensajeError.set(null);
    this.imagen.set({ archivo: null, enlace: '', valido: true });
    this.imagenActual.set(p?.imagenUrl ?? '');

    this.modelo.set(
      p
        ? {
            nombre: p.nombre,
            descripcion: p.descripcion ?? '',
            categoriaId: String(p.categoriaId),
            precio: p.precio
          }
        : { nombre: '', descripcion: '', categoriaId: '', precio: 0 }
    );
  }
}