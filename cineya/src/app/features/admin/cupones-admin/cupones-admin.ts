import { Component, OnInit, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { form, FormField, max, min, required, submit } from '@angular/forms/signals';
import { CuponAdminService } from '../services/cupon-admin';
import { Cupon } from '../../../core/models/cupon.model';

interface DatosCupon {
  codigo: string;
  porcentaje: number;
  edadMinima: number;   // 0 = sin restricción de edad
}

@Component({
  selector: 'app-cupones-admin',
  imports: [FormField, NgTemplateOutlet],
  templateUrl: './cupones-admin.html',
  styleUrl: './cupones-admin.scss'
})
export class CuponesAdmin implements OnInit {
  private cuponAdmin = inject(CuponAdminService);

  cupones = signal<Cupon[]>([]);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);

  // Descuento de bienvenida (primera compra de un usuario registrado)
  porcentajeBienvenida = signal(0);
  guardandoBienvenida = signal(false);
  mensajeBienvenida = signal<string | null>(null);
  errorBienvenida = signal<string | null>(null);

  // Formulario de cupón nuevo
  modelo = signal<DatosCupon>({ codigo: '', porcentaje: 10, edadMinima: 0 });

  formulario = form(this.modelo, (campos) => {
    required(campos.codigo, { message: 'El código es obligatorio' });
    min(campos.porcentaje, 1, { message: 'El descuento tiene que ser de al menos 1 %' });
    max(campos.porcentaje, 100, { message: 'El descuento no puede superar el 100 %' });
    min(campos.edadMinima, 0, { message: 'La edad no puede ser negativa' });
    max(campos.edadMinima, 120, { message: 'Ingresá una edad válida' });
  });

  guardando = signal(false);
  mensajeFormulario = signal<string | null>(null);

  async ngOnInit() {
    await this.cargar();
  }

  alEscribirBienvenida(valor: string) {
    this.porcentajeBienvenida.set(Number(valor));
  }

  async guardarBienvenida() {
    const porcentaje = this.porcentajeBienvenida();
    this.mensajeBienvenida.set(null);
    this.errorBienvenida.set(null);

    if (!Number.isInteger(porcentaje) || porcentaje < 0 || porcentaje > 100) {
      this.errorBienvenida.set('Ingresá un número entero entre 0 y 100. Con 0 no hay descuento de bienvenida.');
      return;
    }

    this.guardandoBienvenida.set(true);
    try {
      await this.cuponAdmin.actualizarDescuentoBienvenida(porcentaje);
      this.mensajeBienvenida.set(
        porcentaje === 0
          ? 'Descuento de bienvenida desactivado.'
          : `Listo: la primera compra de cada usuario registrado tendrá un ${porcentaje} % de descuento.`
      );
    } catch {
      this.errorBienvenida.set('No se pudo guardar. Verificá que tu usuario sea administrador.');
    } finally {
      this.guardandoBienvenida.set(false);
    }
  }

  alEnviar(evento: Event) {
    evento.preventDefault();
    this.mensajeFormulario.set(null);

    submit(this.formulario, {
      action: async () => {
        const datos = this.modelo();
        const codigo = datos.codigo.trim().toUpperCase();

        if (!/^[A-Z0-9_-]{3,20}$/.test(codigo)) {
          this.mensajeFormulario.set('El código tiene de 3 a 20 caracteres: letras, números, guion o guion bajo.');
          return;
        }
        if (!Number.isInteger(datos.porcentaje) || !Number.isInteger(datos.edadMinima)) {
          this.mensajeFormulario.set('El descuento y la edad tienen que ser números enteros.');
          return;
        }

        this.guardando.set(true);
        try {
          await this.cuponAdmin.crear({
            codigo,
            porcentaje: datos.porcentaje,
            edadMinima: datos.edadMinima > 0 ? datos.edadMinima : null
          });
          this.modelo.set({ codigo: '', porcentaje: 10, edadMinima: 0 });
          await this.cargar();
        } catch (error: any) {
          this.mensajeFormulario.set(
            error?.message === 'CUPON_REPETIDO'
              ? 'Ya existe un cupón con ese código.'
              : 'No se pudo crear el cupón. Verificá que tu usuario sea administrador.'
          );
        } finally {
          this.guardando.set(false);
        }
      }
    });
  }

  async alternarEstado(cupon: Cupon) {
    this.mensajeError.set(null);
    const nuevoEstado = !cupon.activo;
    try {
      await this.cuponAdmin.cambiarEstado(cupon.id, nuevoEstado);
      this.cupones.update(lista =>
        lista.map(item => (item.id === cupon.id ? { ...item, activo: nuevoEstado } : item))
      );
    } catch {
      this.mensajeError.set('No se pudo cambiar el estado del cupón.');
    }
  }

  private async cargar() {
    this.mensajeError.set(null);
    try {
      const [bienvenida, cupones] = await Promise.all([
        this.cuponAdmin.obtenerDescuentoBienvenida(),
        this.cuponAdmin.listar()
      ]);
      this.porcentajeBienvenida.set(bienvenida);
      this.cupones.set(cupones);
    } catch {
      this.mensajeError.set('No se pudieron cargar los cupones.');
    } finally {
      this.cargando.set(false);
    }
  }
}