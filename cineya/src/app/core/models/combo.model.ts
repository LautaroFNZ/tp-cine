export interface ProductoDeCombo {
  productoId: string;
  nombre: string;
  precio: number;
  cantidad: number;
}

export interface Combo {
  id: string;
  nombre: string;
  descripcion: string | null;
  precio: number;             // precio fijo del combo
  entradasIncluidas: number;  // cuántas entradas trae
  imagenUrl: string | null;
  activo: boolean;
  incluye: ProductoDeCombo[];
}