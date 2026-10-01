import {
  Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, computed, inject, signal
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { form, FormField, max, min, required, submit } from '@angular/forms/signals';
import { MovieService } from '../../catalog/services/movie';
import { PeliculaAdminService } from '../services/pelicula-admin';
import { Genero } from '../../../core/models/genero.model';
import { ClasificacionEdad, Pelicula } from '../../../core/models/pelicula.model';
import { fechaLocal } from '../../../shared/utils/fechas';
import { normalizarTexto } from '../../../shared/utils/texto';

interface DatosPelicula {
  titulo: string;
  sinopsis: string;
  duracionMinutos: number;
  clasificacionEdad: ClasificacionEdad;
  fechaEstreno: string;      // AAAA-MM-DD
  precioPreventa: number;    // 0 = sin preventa
  finPreventa: string;       // AAAA-MM-DD ('' = sin preventa)
}

const LIMITE_POSTER = 2 * 1024 * 1024;   // 2 MB
const TIPOS_POSTER = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-formulario-pelicula',
  imports: [FormField, NgTemplateOutlet],
  templateUrl: './formulario-pelicula.html',
  styleUrl: './formulario-pelicula.scss'
})
export class FormularioPelicula implements OnInit, OnChanges, OnDestroy {
  // Película a editar; null = alta de una película nueva
  @Input() pelicula: Pelicula | null = null;
  @Output() guardada = new EventEmitter<void>();
  @Output() cancelada = new EventEmitter<void>();

  private movieService = inject(MovieService);
  private peliculaAdmin = inject(PeliculaAdminService);

  clasificaciones: { valor: ClasificacionEdad; texto: string }[] = [
    { valor: 'none', texto: '+0 (todo público)' },
    { valor: '13', texto: '+13' },
    { valor: '18', texto: '+18' }
  ];

  modelo = signal<DatosPelicula>(this.vacio());

  formulario = form(this.modelo, (campos) => {
    required(campos.titulo, { message: 'El título es obligatorio' });
    required(campos.sinopsis, { message: 'La sinopsis es obligatoria' });
    min(campos.duracionMinutos, 1, { message: 'La duración tiene que ser mayor a 0' });
    max(campos.duracionMinutos, 400, { message: 'La duración no puede superar los 400 minutos' });
    required(campos.fechaEstreno, { message: 'La fecha de estreno es obligatoria' });
    min(campos.precioPreventa, 0, { message: 'El precio no puede ser negativo' });
  });

  // Géneros
  generos = signal<Genero[]>([]);
  generosElegidos = signal<number[]>([]);
  nombreGenero = signal('');
  mensajeGenero = signal<string | null>(null);

  // Póster: se puede subir un archivo o pegar un enlace
  modoImagen = signal<'archivo' | 'enlace'>('archivo');
  archivo = signal<File | null>(null);
  urlArchivo = signal<string | null>(null);
  enlace = signal('');
  imagenActual = signal('');
  errorImagen = signal<string | null>(null);

  guardando = signal(false);
  mensajeError = signal<string | null>(null);

  enlaceValido = computed(() => {
    try {
      return new URL(this.enlace().trim()).protocol === 'https:';
    } catch {
      return false;
    }
  });

  // Imagen que se muestra como vista previa
  vistaPrevia = computed(() => {
    if (this.modoImagen() === 'archivo') {
      return this.urlArchivo() ?? this.imagenActual();
    }
    return this.enlaceValido() ? this.enlace().trim() : this.imagenActual();
  });

  async ngOnInit() {
    try {
      this.generos.set(await this.movieService.obtenerGeneros());
    } catch {
      this.mensajeGenero.set('No se pudieron cargar los géneros.');
    }
  }

  // Cada vez que el padre cambia la película, se recarga el formulario
  ngOnChanges() {
    this.cargar();
  }

  ngOnDestroy() {
    this.liberarVistaPrevia();
  }

  cambiarModo(modo: 'archivo' | 'enlace') {
    this.modoImagen.set(modo);
    this.errorImagen.set(null);
  }

  elegirArchivo(evento: Event) {
    const campo = evento.target as HTMLInputElement;
    const elegido = campo.files?.[0] ?? null;
    this.errorImagen.set(null);
    this.liberarVistaPrevia();

    if (!elegido) {
      this.archivo.set(null);
      return;
    }
    if (!TIPOS_POSTER.includes(elegido.type)) {
      this.errorImagen.set('Elegí una imagen JPG, PNG o WEBP.');
      this.archivo.set(null);
      campo.value = '';
      return;
    }
    if (elegido.size > LIMITE_POSTER) {
      this.errorImagen.set('La imagen no puede superar los 2 MB.');
      this.archivo.set(null);
      campo.value = '';
      return;
    }

    this.archivo.set(elegido);
    this.urlArchivo.set(URL.createObjectURL(elegido));
  }

  alternarGenero(id: number) {
    this.generosElegidos.update(ids =>
      ids.includes(id) ? ids.filter(elegido => elegido !== id) : [...ids, id]
    );
  }

  async agregarGenero() {
    const nombre = this.nombreGenero().trim();
    this.mensajeGenero.set(null);
    if (!nombre) return;

    // Si ya existe, solo se lo marca
    const existente = this.generos().find(g => normalizarTexto(g.nombre) === normalizarTexto(nombre));
    if (existente) {
      this.generosElegidos.update(ids => (ids.includes(existente.id) ? ids : [...ids, existente.id]));
      this.nombreGenero.set('');
      return;
    }

    try {
      const nuevo = await this.peliculaAdmin.crearGenero(nombre);
      this.generos.update(lista => [...lista, nuevo].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      this.generosElegidos.update(ids => [...ids, nuevo.id]);
      this.nombreGenero.set('');
    } catch {
      this.mensajeGenero.set('No se pudo crear el género.');
    }
  }

  alEnviar(evento: Event) {
    evento.preventDefault();
    this.mensajeError.set(null);

    submit(this.formulario, {
      action: async () => {
        const datos = this.modelo();

        if (datos.precioPreventa > 0 && !datos.finPreventa) {
          this.mensajeError.set('Indicá hasta qué día dura la preventa.');
          return;
        }

        const hayArchivo = this.modoImagen() === 'archivo' && this.archivo() !== null;
        const hayEnlace = this.modoImagen() === 'enlace' && this.enlace().trim() !== '';
        if (hayEnlace && !this.enlaceValido()) {
          this.mensajeError.set('El enlace del póster tiene que empezar con https://');
          return;
        }
        if (!this.pelicula && !hayArchivo && !hayEnlace) {
          this.mensajeError.set('Elegí un póster: subí un archivo o pegá un enlace.');
          return;
        }

        this.guardando.set(true);
        try {
          let imagenUrl = this.pelicula?.imagenUrl ?? '';
          if (hayArchivo) {
            imagenUrl = await this.peliculaAdmin.subirPoster(this.archivo() as File);
          } else if (hayEnlace) {
            imagenUrl = this.enlace().trim();
          }

          await this.peliculaAdmin.guardar(
            {
              titulo: datos.titulo.trim(),
              sinopsis: datos.sinopsis.trim(),
              imagenUrl,
              duracionMinutos: datos.duracionMinutos,
              clasificacionEdad: datos.clasificacionEdad,
              fechaEstreno: datos.fechaEstreno,
              precioPreventa: datos.precioPreventa > 0 ? datos.precioPreventa : null,
              // La preventa termina al final de ese día, hora de Argentina
              finPreventa: datos.precioPreventa > 0 ? `${datos.finPreventa}T23:59:59-03:00` : null
            },
            this.generosElegidos(),
            this.pelicula?.id
          );
          this.guardada.emit();
        } catch {
          this.mensajeError.set('No se pudo guardar la película. Verificá que tu usuario sea administrador.');
        } finally {
          this.guardando.set(false);
        }
      }
    });
  }

  private cargar() {
    const p = this.pelicula;
    this.liberarVistaPrevia();
    this.archivo.set(null);
    this.enlace.set('');
    this.errorImagen.set(null);
    this.mensajeError.set(null);
    this.modoImagen.set('archivo');

    if (!p) {
      this.modelo.set(this.vacio());
      this.generosElegidos.set([]);
      this.imagenActual.set('');
      return;
    }

    this.modelo.set({
      titulo: p.titulo,
      sinopsis: p.sinopsis,
      duracionMinutos: p.duracionMinutos,
      clasificacionEdad: p.clasificacionEdad,
      fechaEstreno: p.fechaEstreno,
      precioPreventa: p.precioPreventa ?? 0,
      finPreventa: p.finPreventa ? this.fechaArgentina(p.finPreventa) : ''
    });
    this.generosElegidos.set((p.generos ?? []).map(genero => genero.id));
    this.imagenActual.set(p.imagenUrl);
  }

  private vacio(): DatosPelicula {
    return {
      titulo: '',
      sinopsis: '',
      duracionMinutos: 90,
      clasificacionEdad: 'none',
      fechaEstreno: fechaLocal(new Date()),
      precioPreventa: 0,
      finPreventa: ''
    };
  }

  private fechaArgentina(iso: string): string {
    return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  }

  private liberarVistaPrevia() {
    const url = this.urlArchivo();
    if (url) URL.revokeObjectURL(url);
    this.urlArchivo.set(null);
  }
}