import { Component, OnInit, signal } from '@angular/core';
import { MovieService } from '../services/movie';
import { Pelicula } from '../../../core/models/pelicula.model';

@Component({
  selector: 'app-movie-list',
  imports: [],
  templateUrl: './movie-list.html',
  styleUrl: './movie-list.scss'
})
export class MovieList implements OnInit {
  peliculas = signal<Pelicula[]>([]);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);

  constructor(private movieService: MovieService) {}

  async ngOnInit() {
    try {
      this.peliculas.set(await this.movieService.obtenerPeliculas());
    } catch {
      this.mensajeError.set('No se pudieron cargar las películas.');
    } finally {
      this.cargando.set(false);
    }
  }
}