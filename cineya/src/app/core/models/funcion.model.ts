import { ClasificacionEdad } from './pelicula.model';

export type FormatoFuncion = '2D' | '3D' | '4D' | '5D';
export type IdiomaFuncion = 'castellano' | 'subtitulada';

export interface Funcion {
  id: string;
  peliculaId: string;
  pelicula: string;
  salaId: string;
  sala: string;
  inicio: string;
  fin: string;
  formato: FormatoFuncion;
  idioma: IdiomaFuncion;
  clasificacionEdad: ClasificacionEdad;
}

export interface DatosProgramacion {
  peliculaId: string;
  diasSemana: number[];
  hora: string;
  desde: string;
  hasta: string;
  formato: FormatoFuncion;
  idioma: IdiomaFuncion;
}

export interface ResultadoProgramacion {
  fecha: string;
  sala: string | null;
  estado: 'creada' | 'sin_sala';
}