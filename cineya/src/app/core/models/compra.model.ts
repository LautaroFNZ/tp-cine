import { TipoButaca } from './butaca.model';
import { ClasificacionEdad } from './pelicula.model';

export interface EntradaCompra {
  fila: string;
  numero: number;
  tipo: TipoButaca;
  precio: number;
}

export interface ProductoCompra {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
}

export interface Compra {
  id: string;
  codigo: string;
  total: number;
  creadaEn: string;
  metodoPago: string | null;
  pelicula: string;
  clasificacionEdad: ClasificacionEdad;
  sala: string;
  formato: string;
  idioma: string;
  inicio: string;
  fin: string;
  entradas: EntradaCompra[];
  productos: ProductoCompra[];
}