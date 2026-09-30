import { Pipe, PipeTransform } from '@angular/core';
import { ClasificacionEdad } from '../../core/models/pelicula.model';

@Pipe({ name: 'edadMinima' })
export class EdadMinimaPipe implements PipeTransform {
  transform(clasificacion: ClasificacionEdad): string {
    return clasificacion === 'none' ? '+0' : `+${clasificacion}`;
  }
}