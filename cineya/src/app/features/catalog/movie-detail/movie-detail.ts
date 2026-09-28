import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { form, FormField, maxLength, submit } from '@angular/forms/signals';
import { MovieService } from '../services/movie';
import { ReviewService } from '../services/reviews';
import { AuthService } from '../../../core/services/auth';
import { Pelicula } from '../../../core/models/pelicula.model';
import { Review } from '../../../core/models/review.model';

interface DatosReview {
  puntaje: number;
  comentario: string;
}

@Component({
  selector: 'app-movie-detail',
  imports: [RouterLink, FormField, DatePipe],
  templateUrl: './movie-detail.html',
  styleUrl: './movie-detail.scss'
})
export class MovieDetail implements OnInit {
  private rutaActiva = inject(ActivatedRoute);
  private movieService = inject(MovieService);
  private reviewService = inject(ReviewService);
  auth = inject(AuthService);

  pelicula = signal<Pelicula | null>(null);
  reviews = signal<Review[]>([]);
  cargando = signal(true);
  noEncontrada = signal(false);

  estrellas = [1, 2, 3, 4, 5];

  // Cantidad de estrellas sobre las que está el cursor (0 = ninguna)
  puntajePrevio = signal(0);

  estadoEstrella(n: number): 'llena' | 'previa' | 'vacia' {
    const previo = this.puntajePrevio();
    const elegido = this.modelo().puntaje;

    if (previo > 0) {
      if (n > previo) return 'vacia';
      return n <= elegido ? 'llena' : 'previa';
    }
    return n <= elegido ? 'llena' : 'vacia';
  }

  promedio = computed(() => {
    const lista = this.reviews();
    if (lista.length === 0) return null;
    const suma = lista.reduce((acumulado, review) => acumulado + review.puntaje, 0);
    return Math.round((suma / lista.length) * 10) / 10;
  });

  miReview = computed(() => {
    const usuarioId = this.auth.sesion()?.user.id;
    return this.reviews().find(review => review.usuarioId === usuarioId) ?? null;
  });

  modelo = signal<DatosReview>({ puntaje: 0, comentario: '' });

  formulario = form(this.modelo, (campos) => {
    maxLength(campos.comentario, 300, { message: 'El comentario no puede superar los 300 caracteres' });
  });

  enviando = signal(false);
  mensajeError = signal<string | null>(null);
  mensajeExito = signal<string | null>(null);

  async ngOnInit() {
    const id = this.rutaActiva.snapshot.paramMap.get('id');
    if (!id) {
      this.noEncontrada.set(true);
      this.cargando.set(false);
      return;
    }

    const pelicula = await this.movieService.obtenerPeliculaPorId(id);
    if (!pelicula) {
      this.noEncontrada.set(true);
    } else {
      this.pelicula.set(pelicula);
      await this.cargarReviews(id);
    }
    this.cargando.set(false);
  }

  elegirPuntaje(puntaje: number) {
    this.modelo.update(actual => ({ ...actual, puntaje }));
  }

  alEnviar(evento: Event) {
    evento.preventDefault();
    this.mensajeError.set(null);
    this.mensajeExito.set(null);

    if (this.modelo().puntaje < 1) {
      this.mensajeError.set('Elegí un puntaje de 1 a 5 estrellas.');
      return;
    }

    submit(this.formulario, {
      action: async () => {
        const peliculaId = this.pelicula()?.id;
        const usuarioId = this.auth.sesion()?.user.id;
        if (!peliculaId || !usuarioId) return;

        this.enviando.set(true);
        try {
          const datos = this.modelo();
          await this.reviewService.guardar(peliculaId, usuarioId, datos.puntaje, datos.comentario.trim());
          await this.cargarReviews(peliculaId);
          this.mensajeExito.set('¡Gracias por tu reseña!');
        } catch {
          this.mensajeError.set('No se pudo guardar tu reseña. Probá de nuevo.');
        } finally {
          this.enviando.set(false);
        }
      }
    });
  }

  private async cargarReviews(peliculaId: string) {
    // Espera a que se restaure la sesión para saber cuál es la review del usuario
    await this.auth.listo;

    try {
      this.reviews.set(await this.reviewService.obtenerPorPelicula(peliculaId));
    } catch {
      this.mensajeError.set('No se pudieron cargar las reseñas.');
      return;
    }

    // Si el usuario ya dejó una review, se completa el formulario con sus datos
    const mia = this.miReview();
    if (mia) {
      this.modelo.set({ puntaje: mia.puntaje, comentario: mia.comentario ?? '' });
    }
  }
}