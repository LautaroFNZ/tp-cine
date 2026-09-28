import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MovieService } from '../services/movie';
import { Pelicula } from '../../../core/models/pelicula.model';

@Component({
  selector: 'app-movie-detail',
  imports: [RouterLink],
  templateUrl: './movie-detail.html',
  styleUrl: './movie-detail.scss'
})
export class MovieDetail implements OnInit {
  pelicula = signal<Pelicula | null>(null);
  cargando = signal(true);
  noEncontrada = signal(false);

  constructor(
    private route: ActivatedRoute,
    private movieService: MovieService
  ) {}

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
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
    }
    this.cargando.set(false);
  }
}