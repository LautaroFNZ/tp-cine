export interface AlertaEstreno {
  peliculaId: string;
  titulo: string;
  imagenUrl: string;
  fechaEstreno: string;
  vista: boolean;   // el usuario ya vio el aviso de que abrió la venta
}