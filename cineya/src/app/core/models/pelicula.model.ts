import { Genero } from './genero.model';

export type ClasificacionEdad = 'none' | '13' | '18';

export interface Pelicula {
  id: string;
  titulo: string;
  sinopsis: string;
  imagenUrl: string;
  duracionMinutos: number;
  clasificacionEdad: ClasificacionEdad;
  fechaEstreno: string;
  precioPreventa: number | null;
  finPreventa: string | null;
  creadoEn: string;
  generos?: Genero[];
  activa?: boolean;
  promedio?: number | null;
  cantidadReviews?: number;
}