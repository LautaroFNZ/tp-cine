export interface ConfiguracionPrecios {
  precioBase: number;
  recargoVip: number;
}

export interface PreciosFuncion extends ConfiguracionPrecios {
  enPreventa: boolean;
}