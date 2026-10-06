import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { MovieService } from '../services/movie';
import { Pelicula } from '../../../core/models/pelicula.model';
import { Genero } from '../../../core/models/genero.model';
import { FiltrarPeliculasPipe } from '../../../shared/pipes/filtrar-peliculas-pipe';
import { DecimalPipe } from '@angular/common';
import { EdadMinimaPipe } from '../../../shared/pipes/edad-minima-pipe';
import { estadoDeEstreno } from '../../../shared/utils/estrenos';
import { toSignal } from '@angular/core/rxjs-interop';
import { SeccionEstrenos } from '../seccion-estrenos/seccion-estrenos';

@Component({
  selector: 'app-movie-list',
  imports: [RouterLink, FiltrarPeliculasPipe, DecimalPipe, EdadMinimaPipe , SeccionEstrenos],
  templateUrl: './movie-list.html',
  styleUrl: './movie-list.scss'
})

export class MovieList implements OnInit {
  peliculas = signal<Pelicula[]>([]);
  estrenos = signal<Pelicula[]>([]);
  private rutaActiva = inject(ActivatedRoute);
  private fragmento = toSignal(this.rutaActiva.fragment, { initialValue: null });
  generos = signal<Genero[]>([]);
  textoBusqueda = signal('');
  generoSeleccionado = signal<number | null>(null);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);

  constructor(private movieService: MovieService) {
  // Si se llegó con #cartelera o #estrenos en la dirección, se baja hasta esa sección
  // cuando ya está dibujada (primero hay que esperar a que carguen las películas)
  effect(() => {
      const seccion = this.fragmento();
      if (seccion && !this.cargando()) {
        setTimeout(() =>
          document.getElementById(seccion)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        );
      }
    });
  }

  async ngOnInit() {
    try {
      const [peliculas, generos] = await Promise.all([
        this.movieService.obtenerPeliculas(),
        this.movieService.obtenerGeneros()
      ]);
      // La cartelera muestra lo que ya se estrenó; lo demás va a la sección Estrenos
      this.peliculas.set(peliculas.filter(pelicula => estadoDeEstreno(pelicula.fechaEstreno).estado === 'cartelera'));
      this.estrenos.set(peliculas.filter(pelicula => estadoDeEstreno(pelicula.fechaEstreno).estado !== 'cartelera'));
      this.generos.set(generos);
    } catch {
      this.mensajeError.set('No se pudieron cargar las películas.');
    } finally {
      this.cargando.set(false);
    }
  }
}