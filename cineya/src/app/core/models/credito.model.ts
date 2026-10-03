export interface MovimientoCredito {
  id: string;
  tipo: 'cancelacion' | 'uso';
  monto: number;        // positivo si se acreditó, negativo si se usó
  descripcion: string;
  fecha: string;
  codigoCompra: string | null;
}