export interface Recompensa {
  id: string;
  tipo: 'entrada' | 'producto';
  productoId: string | null;
  nombre: string;
  puntos: number;      // lo que cuesta, en puntos
  activa: boolean;
}

export interface MovimientoPuntos {
  id: string;
  tipo: 'ganado' | 'canjeado' | 'ajuste';
  puntos: number;       // positivo si se ganó, negativo si se canjeó
  cantidad: number;
  descripcion: string;
  fecha: string;
  codigoCompra: string | null;
}