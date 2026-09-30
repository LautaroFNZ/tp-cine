import { Pipe, PipeTransform } from '@angular/core';
import { Pelicula } from '../../core/models/pelicula.model';
import { normalizarTexto } from '../utils/texto';

@Pipe({ name: 'filtrarPeliculas' })
export class FiltrarPeliculasPipe implements PipeTransform {
  transform(peliculas: Pelicula[], texto: string, generoId: number | null): Pelicula[] {
    const busqueda = normalizarTexto(texto);

    return peliculas.filter(pelicula => {
      const coincideTitulo = !busqueda || normalizarTexto(pelicula.titulo).includes(busqueda);
      const coincideGenero =
        generoId === null || (pelicula.generos ?? []).some(genero => genero.id === generoId);
      return coincideTitulo && coincideGenero;
    });
  }
}