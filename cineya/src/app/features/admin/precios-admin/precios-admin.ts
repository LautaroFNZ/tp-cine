import { Component, OnInit, inject, signal } from '@angular/core';
import { form, FormField, min, submit } from '@angular/forms/signals';
import { PrecioService } from '../../../core/services/precios';

interface DatosPrecios {
  precioBase: number;
  recargoVip: number;
}

@Component({
  selector: 'app-precios-admin',
  imports: [FormField],
  templateUrl: './precios-admin.html',
  styleUrl: './precios-admin.scss'
})

export class PreciosAdmin implements OnInit {
  private precioService = inject(PrecioService);

  modelo = signal<DatosPrecios>({ precioBase: 0, recargoVip: 0 });

  formulario = form(this.modelo, (campos) => {
    min(campos.precioBase, 0, { message: 'El precio no puede ser negativo' });
    min(campos.recargoVip, 0, { message: 'El recargo no puede ser negativo' });
  });

  cargando = signal(true);
  enviando = signal(false);
  mensajeError = signal<string | null>(null);
  mensajeExito = signal<string | null>(null);

  async ngOnInit() {
    try {
      this.modelo.set(await this.precioService.obtenerConfiguracion());
    } catch {
      this.mensajeError.set('No se pudieron cargar los precios.');
    } finally {
      this.cargando.set(false);
    }
  }

  alEnviar(evento: Event) {
    evento.preventDefault();
    this.mensajeError.set(null);
    this.mensajeExito.set(null);

    submit(this.formulario, {
      action: async () => {
        this.enviando.set(true);
        try {
          await this.precioService.actualizarConfiguracion(this.modelo());
          this.mensajeExito.set('Precios actualizados.');
        } catch {
          this.mensajeError.set('No se pudieron guardar los precios. Verificá que tu usuario sea administrador.');
        } finally {
          this.enviando.set(false);
        }
      }
    });
  }
}