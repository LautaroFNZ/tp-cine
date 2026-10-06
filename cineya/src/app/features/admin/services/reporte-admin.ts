import { Service, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';

export interface VentaDiaria {
  dia: string;        // "AAAA-MM-DD"
  compras: number;
  entradas: number;
  facturado: number;
}

export interface ItemRanking {
  id: string;
  nombre: string;
  cantidad: number;
}

@Service()
export class ReporteAdminService {
  private supabase = inject(SupabaseService);

  // Facturación, compras y entradas de cada día del rango (los días sin ventas vienen en cero)
  async ventasPorDia(desde: string, hasta: string): Promise<VentaDiaria[]> {
    const { data: filas, error } = await this.supabase.client.rpc('report_daily_sales', {
      p_from: desde,
      p_to: hasta
    });
    if (error) this.lanzarError(error.message);

    return (filas ?? []).map((fila: any): VentaDiaria => ({
      dia: fila.day,
      compras: Number(fila.purchases),
      entradas: Number(fila.tickets),
      facturado: Number(fila.revenue)
    }));
  }

  // Películas con más entradas vendidas en el rango
  async peliculasMasVendidas(desde: string, hasta: string, limite = 5): Promise<ItemRanking[]> {
    const { data: filas, error } = await this.supabase.client.rpc('report_top_movies', {
      p_from: desde,
      p_to: hasta,
      p_limit: limite
    });
    if (error) this.lanzarError(error.message);

    return (filas ?? []).map((fila: any): ItemRanking => ({
      id: fila.movie_id,
      nombre: fila.title,
      cantidad: Number(fila.tickets_sold)
    }));
  }

  // Productos del candy bar más vendidos en el rango, en unidades
  async productosMasVendidos(desde: string, hasta: string, limite = 5): Promise<ItemRanking[]> {
    const { data: filas, error } = await this.supabase.client.rpc('report_top_products', {
      p_from: desde,
      p_to: hasta,
      p_limit: limite
    });
    if (error) this.lanzarError(error.message);

    return (filas ?? []).map((fila: any): ItemRanking => ({
      id: fila.product_id,
      nombre: fila.name,
      cantidad: Number(fila.units_sold)
    }));
  }

  private lanzarError(mensaje: string): never {
    if (mensaje.includes('not_admin')) throw new Error('SIN_PERMISO');
    if (mensaje.includes('invalid_range')) throw new Error('RANGO_INVALIDO');
    if (mensaje.includes('range_too_large')) throw new Error('RANGO_MUY_GRANDE');
    console.error('Error al obtener el reporte', mensaje);
    throw new Error(mensaje);
  }
}