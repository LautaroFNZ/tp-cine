import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe, NgTemplateOutlet, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { form, FormField, required, submit } from '@angular/forms/signals';
import { MovieService } from '../../catalog/services/movie';
import { FuncionService } from '../../../core/services/funciones';
import { Pelicula } from '../../../core/models/pelicula.model';
import {
  FormatoFuncion,
  Funcion,
  IdiomaFuncion,
  ResultadoProgramacion
} from '../../../core/models/funcion.model';
import { fechaLocal } from '../../../shared/utils/fechas';

registerLocaleData(localeEsAr);

interface FormularioProgramacion {
  peliculaId: string;
  hora: string;
  desde: string;
  hasta: string;
  formato: FormatoFuncion;
  idioma: IdiomaFuncion;
}

@Component({
  selector: 'app-panel-admin',
  imports: [FormField, DatePipe, NgTemplateOutlet],
  templateUrl: './panel-admin.html',
  styleUrl: './panel-admin.scss'
})
export class PanelAdmin implements OnInit {
  private movieService = inject(MovieService);
  private funcionService = inject(FuncionService);

  // Números ISO: 1 = lunes ... 7 = domingo
  dias = [
    { numero: 1, corto: 'Lun' },
    { numero: 2, corto: 'Mar' },
    { numero: 3, corto: 'Mié' },
    { numero: 4, corto: 'Jue' },
    { numero: 5, corto: 'Vie' },
    { numero: 6, corto: 'Sáb' },
    { numero: 7, corto: 'Dom' }
  ];
  formatos: FormatoFuncion[] = ['2D', '3D', '4D', '5D'];
  idiomas: IdiomaFuncion[] = ['castellano', 'subtitulada'];

  peliculas = signal<Pelicula[]>([]);
  funciones = signal<Funcion[]>([]);
  diasSeleccionados = signal<number[]>([]);
  resultados = signal<ResultadoProgramacion[]>([]);

  modelo = signal<FormularioProgramacion>({
    peliculaId: '',
    hora: '18:00',
    desde: fechaLocal(new Date()),
    hasta: fechaLocal(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)),
    formato: '2D',
    idioma: 'castellano'
  });

  formulario = form(this.modelo, (campos) => {
    required(campos.peliculaId, { message: 'Elegí una película' });
    required(campos.hora, { message: 'Indicá la hora' });
    required(campos.desde, { message: 'Indicá desde qué fecha' });
    required(campos.hasta, { message: 'Indicá hasta qué fecha' });
  });

  enviando = signal(false);
  mensajeError = signal<string | null>(null);

  async ngOnInit() {
    try {
      const [peliculas, funciones] = await Promise.all([
        this.movieService.obtenerPeliculas(),
        this.funcionService.obtenerProximas()
      ]);
      this.peliculas.set(peliculas);
      this.funciones.set(funciones);
    } catch {
      this.mensajeError.set('No se pudieron cargar los datos.');
    }
  }

  alternarDia(numero: number) {
    this.diasSeleccionados.update(actuales =>
      actuales.includes(numero) ? actuales.filter(dia => dia !== numero) : [...actuales, numero]
    );
  }

  alEnviar(evento: Event) {
    evento.preventDefault();
    this.mensajeError.set(null);
    this.resultados.set([]);

    if (this.diasSeleccionados().length === 0) {
      this.mensajeError.set('Elegí al menos un día de la semana.');
      return;
    }
    if (this.modelo().hasta < this.modelo().desde) {
      this.mensajeError.set('La fecha "hasta" no puede ser anterior a "desde".');
      return;
    }

    submit(this.formulario, {
      action: async () => {
        this.enviando.set(true);
        try {
          this.resultados.set(
            await this.funcionService.programar({
              ...this.modelo(),
              diasSemana: this.diasSeleccionados()
            })
          );
          this.funciones.set(await this.funcionService.obtenerProximas());
        } catch {
          this.mensajeError.set('No se pudieron programar las funciones. Verificá que tu usuario sea administrador.');
        } finally {
          this.enviando.set(false);
        }
      }
    });
  }

  async eliminar(id: string) {
    try {
      await this.funcionService.eliminar(id);
      this.funciones.update(lista => lista.filter(funcion => funcion.id !== id));
    } catch {
      this.mensajeError.set('No se pudo eliminar la función.');
    }
  }
}