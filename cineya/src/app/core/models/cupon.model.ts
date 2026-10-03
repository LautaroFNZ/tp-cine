export interface Cupon {
  id: string;
  codigo: string;
  porcentaje: number;
  edadMinima: number | null;   // null = cualquier edad
  activo: boolean;
  usos: number;
}