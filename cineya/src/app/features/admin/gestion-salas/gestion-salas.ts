import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { Sala, SalaAdminService } from '../services/sala-admin';

registerLocaleData(localeEsAr);

@Component({
  selector: 'app-gestion-salas',
  imports: [DatePipe],
  templateUrl: './gestion-salas.html',
  styleUrl: './gestion-salas.scss'
})
export class GestionSalas implements OnInit {
  private salaAdmin = inject(SalaAdminService);

  salas = signal<Sala[]>([]);
  cargando = signal(true);
  cargaFallida = signal(false);
  guardando = signal(false);
  mensajeError = signal<string | null>(null);
  mensajeExito = signal<string | null>(null);

  // El nombre de la sala que se está por agregar, mientras se espera la confirmación
  nombrePendiente = signal<string | null>(null);

  // El número de la próxima sala: el más alto que ya existe, más uno.
  // Si las salas son la 1, 2, 3 y 4, es la 5 (lo mismo que cantidad de salas + 1).
  // Se toma el más alto y no la cantidad para no repetir un nombre si alguna vez falta una sala del medio.
  siguienteNumero = computed(() => {
    const numeros = this.salas()
      .map(sala => /^sala\s+(\d+)$/i.exec(sala.nombre.trim()))
      .filter((coincidencia): coincidencia is RegExpExecArray => coincidencia !== null)
      .map(coincidencia => Number(coincidencia[1]));
    return numeros.length > 0 ? Math.max(...numeros) + 1 : this.salas().length + 1;
  });

  proximaSala = computed(() => `Sala ${this.siguienteNumero()}`);

  async ngOnInit() {
    await this.cargar();
  }

  // Primer paso: se muestra qué sala se va a agregar y se pide confirmación
  pedirConfirmacion() {
    this.mensajeError.set(null);
    this.mensajeExito.set(null);
    this.nombrePendiente.set(this.proximaSala());
  }

  cancelar() {
    this.nombrePendiente.set(null);
  }

  // Segundo paso: recién acá se crea la sala
  async confirmar() {
    const nombre = this.nombrePendiente();
    if (!nombre) return;

    this.guardando.set(true);
    try {
      await this.salaAdmin.crear(nombre);
      this.mensajeExito.set(`Se agregó la ${nombre}, con sus butacas. Ya se puede usar para programar funciones.`);
    } catch (error: any) {
      const mensajes: Record<string, string> = {
        // Dos administradores agregando a la vez: la base rechaza el nombre repetido
        SALA_REPETIDA: `La ${nombre} ya existe: alguien la agregó hace un instante. Se actualizó la lista.`,
        SIN_PERMISO: 'Solo un administrador puede agregar salas.'
      };
      this.mensajeError.set(mensajes[error?.message] ?? 'No se pudo agregar la sala. Probá de nuevo.');
    } finally {
      this.nombrePendiente.set(null);
      this.guardando.set(false);
    }
    await this.cargar();
  }

  private async cargar() {
    try {
      this.salas.set(await this.salaAdmin.listar());
      this.cargaFallida.set(false);
    } catch {
      this.cargaFallida.set(true);
      this.mensajeError.set('No se pudieron cargar las salas.');
    } finally {
      this.cargando.set(false);
    }
  }
}