// Los valores 'normal', 'accessible' y 'vip' son los códigos que guarda la base
export type TipoButaca = 'normal' | 'accessible' | 'vip';

export interface Butaca {
  id: string;
  fila: string;
  ordenFila: number;
  bloque: 1 | 2 | 3;
  numero: number;
  tipo: TipoButaca;
}