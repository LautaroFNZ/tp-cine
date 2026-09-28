import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MovieService } from '../services/movie';
import { Pelicula } from '../../../core/models/pelicula.model';
import { Genero } from '../../../core/models/genero.model';
import { FiltrarPeliculasPipe } from '../../../shared/pipes/filtrar-peliculas-pipe';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-movie-list',
  imports: [RouterLink, FiltrarPeliculasPipe, DecimalPipe],
  templateUrl: './movie-list.html',
  styleUrl: './movie-list.scss'
})
export class MovieList implements OnInit {
  peliculas = signal<Pelicula[]>([]);
  generos = signal<Genero[]>([]);
  textoBusqueda = signal('');
  generoSeleccionado = signal<number | null>(null);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);

  constructor(private movieService: MovieService) {}

  async ngOnInit() {
    try {
      const [peliculas, generos] = await Promise.all([
        this.movieService.obtenerPeliculas(),
        this.movieService.obtenerGeneros()
      ]);
      this.peliculas.set(peliculas);
      this.generos.set(generos);
    } catch {
      this.mensajeError.set('No se pudieron cargar las películas.');
    } finally {
      this.cargando.set(false);
    }
  }
}