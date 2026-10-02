export interface CategoriaProducto {
  id: number;
  nombre: string;
}

export interface Producto {
  id: string;
  categoriaId: number;
  categoria: string;
  nombre: string;
  descripcion: string | null;
  precio: number;
  imagenUrl: string | null;
  activo: boolean;
}