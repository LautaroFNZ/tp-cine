import { Component, OnInit, inject, signal } from '@angular/core';
import { CurrencyPipe, NgTemplateOutlet, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { form, FormField, max, min, required, submit } from '@angular/forms/signals';
import { ComboAdminService } from '../services/combo-admin';
import { CandyAdminService } from '../services/candy-admin';
import { Combo } from '../../../core/models/combo.model';
import { Producto } from '../../../core/models/producto.model';
import { SelectorImagen, SeleccionImagen } from '../../../shared/components/selector-imagen/selector-imagen';

registerLocaleData(localeEsAr);

interface DatosCombo {
  nombre: string;
  descripcion: string;
  precio: number;
  entradasIncluidas: number;
}

interface ProductoElegido {
  productoId: string;
  nombre: string;
  cantidad: number;
}

@Component({
  selector: 'app-combos-admin',
  imports: [FormField, NgTemplateOutlet, CurrencyPipe, SelectorImagen],
  templateUrl: './combos-admin.html',
  styleUrl: './combos-admin.scss'
})
export class CombosAdmin implements OnInit {
  private comboAdmin = inject(ComboAdminService);
  private candyAdmin = inject(CandyAdminService);

  combos = signal<Combo[]>([]);
  productos = signal<Producto[]>([]);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);

  formularioAbierto = signal(false);
  comboEnEdicion = signal<Combo | null>(null);

  modelo = signal<DatosCombo>({ nombre: '', descripcion: '', precio: 0, entradasIncluidas: 1 });

  formulario = form(this.modelo, (campos) => {
    required(campos.nombre, { message: 'El nombre es obligatorio' });
    min(campos.precio, 1, { message: 'El precio tiene que ser mayor a 0' });
    min(campos.entradasIncluidas, 1, { message: 'El combo incluye al menos una entrada' });
    max(campos.entradasIncluidas, 10, { message: 'Un combo puede incluir hasta 10 entradas' });
  });

  // Productos que trae el combo
  incluye = signal<ProductoElegido[]>([]);
  productoElegido = signal('');
  cantidadElegida = signal(1);
  mensajeProductos = signal<string | null>(null);

  imagen = signal<SeleccionImagen>({ archivo: null, enlace: '', valido: true });
  imagenActual = signal('');

  guardando = signal(false);
  mensajeFormulario = signal<string | null>(null);

  async ngOnInit() {
    await this.cargar();
  }

  nuevo() {
    this.abrir(null);
  }

  editar(combo: Combo) {
    this.abrir(combo);
  }

  cerrarFormulario() {
    this.formularioAbierto.set(false);
    this.comboEnEdicion.set(null);
  }

  alElegirImagen(seleccion: SeleccionImagen) {
    this.imagen.set(seleccion);
  }

  agregarProducto() {
    this.mensajeProductos.set(null);
    const id = this.productoElegido();
    const cantidad = this.cantidadElegida();
    const producto = this.productos().find(item => item.id === id);

    if (!producto) {
      this.mensajeProductos.set('Elegí un producto.');
      return;
    }
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 20) {
      this.mensajeProductos.set('La cantidad tiene que ser un número entero entre 1 y 20.');
      return;
    }

    // Si el producto ya estaba, se suma la cantidad
    this.incluye.update(lista =>
      lista.some(item => item.productoId === id)
        ? lista.map(item => (item.productoId === id ? { ...item, cantidad: item.cantidad + cantidad } : item))
        : [...lista, { productoId: id, nombre: producto.nombre, cantidad }]
    );
    this.productoElegido.set('');
    this.cantidadElegida.set(1);
  }

  quitarProducto(productoId: string) {
    this.incluye.update(lista => lista.filter(item => item.productoId !== productoId));
  }

  alEnviar(evento: Event) {
    evento.preventDefault();
    this.mensajeFormulario.set(null);

    submit(this.formulario, {
      action: async () => {
        const datos = this.modelo();
        const imagen = this.imagen();

        if (this.incluye().length === 0) {
          this.mensajeFormulario.set('Agregá al menos un producto al combo.');
          return;
        }
        if (this.incluye().some(item => item.cantidad > 20)) {
          this.mensajeFormulario.set('Un producto no puede superar las 20 unidades por combo.');
          return;
        }
        if (!Number.isInteger(datos.entradasIncluidas)) {
          this.mensajeFormulario.set('Las entradas incluidas tienen que ser un número entero.');
          return;
        }
        if (!imagen.valido) {
          this.mensajeFormulario.set('Revisá la imagen elegida.');
          return;
        }

        this.guardando.set(true);
        try {
          let imagenUrl = this.comboEnEdicion()?.imagenUrl ?? null;
          if (imagen.archivo) {
            imagenUrl = await this.candyAdmin.subirImagen(imagen.archivo);
          } else if (imagen.enlace) {
            imagenUrl = imagen.enlace;
          }

          await this.comboAdmin.guardar(
            {
              nombre: datos.nombre.trim(),
              descripcion: datos.descripcion.trim(),
              precio: datos.precio,
              entradasIncluidas: datos.entradasIncluidas,
              imagenUrl,
              incluye: this.incluye().map(item => ({ productoId: item.productoId, cantidad: item.cantidad }))
            },
            this.comboEnEdicion()?.id
          );
          this.cerrarFormulario();
          await this.cargar();
        } catch {
          this.mensajeFormulario.set('No se pudo guardar el combo. Verificá que tu usuario sea administrador.');
        } finally {
          this.guardando.set(false);
        }
      }
    });
  }

  async alternarDisponibilidad(combo: Combo) {
    this.mensajeError.set(null);
    const nuevoEstado = !combo.activo;
    try {
      await this.comboAdmin.cambiarDisponibilidad(combo.id, nuevoEstado);
      this.combos.update(lista =>
        lista.map(item => (item.id === combo.id ? { ...item, activo: nuevoEstado } : item))
      );
    } catch {
      this.mensajeError.set('No se pudo cambiar la disponibilidad del combo.');
    }
  }

  private abrir(combo: Combo | null) {
    this.mensajeFormulario.set(null);
    this.mensajeProductos.set(null);
    this.productoElegido.set('');
    this.cantidadElegida.set(1);
    this.imagen.set({ archivo: null, enlace: '', valido: true });
    this.imagenActual.set(combo?.imagenUrl ?? '');
    this.comboEnEdicion.set(combo);

    this.modelo.set(
      combo
        ? {
            nombre: combo.nombre,
            descripcion: combo.descripcion ?? '',
            precio: combo.precio,
            entradasIncluidas: combo.entradasIncluidas
          }
        : { nombre: '', descripcion: '', precio: 0, entradasIncluidas: 1 }
    );
    this.incluye.set(
      combo
        ? combo.incluye.map(item => ({ productoId: item.productoId, nombre: item.nombre, cantidad: item.cantidad }))
        : []
    );
    this.formularioAbierto.set(true);
  }

  private async cargar() {
    this.mensajeError.set(null);
    try {
      const [combos, productos] = await Promise.all([
        this.comboAdmin.listar(),
        this.candyAdmin.listarProductos()
      ]);
      this.combos.set(combos);
      // Solo se pueden agregar productos disponibles
      this.productos.set(productos.filter(producto => producto.activo));
    } catch {
      this.mensajeError.set('No se pudieron cargar los combos.');
    } finally {
      this.cargando.set(false);
    }
  }
}