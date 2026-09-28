import { Pipe, PipeTransform } from '@angular/core';
import { Pelicula } from '../../core/models/pelicula.model';

@Pipe({ name: 'filtrarPeliculas' })
export class FiltrarPeliculasPipe implements PipeTransform {
  transform(peliculas: Pelicula[], texto: string, generoId: number | null): Pelicula[] {
    const busqueda = texto.trim().toLowerCase();

    return peliculas.filter(pelicula => {
      const coincideTitulo = !busqueda || pelicula.titulo.toLowerCase().includes(busqueda);
      const coincideGenero =
        generoId === null || (pelicula.generos ?? []).some(genero => genero.id === generoId);
      return coincideTitulo && coincideGenero;
    });
  }
}