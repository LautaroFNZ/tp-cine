export interface Review {
  id: string;
  peliculaId: string;
  usuarioId: string;
  puntaje: number;
  comentario: string | null;
  autor: string;
  creadoEn: string;
}