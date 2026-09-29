import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { ConfiguracionPrecios, PreciosFuncion } from '../models/precios.model';

@Injectable({ providedIn: 'root' })
export class PrecioService {
  constructor(private supabase: SupabaseService) {}

  // Precios que rigen para una función (considera la preventa de la película)
  async obtenerPreciosFuncion(funcionId: string): Promise<PreciosFuncion | null> {
    const { data: filas, error } = await this.supabase.client.rpc('get_showtime_prices', {
      p_showtime_id: funcionId
    });

    if (error) {
      console.error('Error al obtener los precios', error);
      return null;
    }

    const fila = filas?.[0];
    if (!fila) return null;

    return {
      precioBase: Number(fila.base_price),
      recargoVip: Number(fila.vip_surcharge),
      enPreventa: Boolean(fila.is_presale)
    };
  }

  async obtenerConfiguracion(): Promise<ConfiguracionPrecios> {
    const { data: fila, error } = await this.supabase.client
      .from('pricing_settings')
      .select('base_price, vip_surcharge')
      .single();

    if (error) {
      console.error('Error al obtener la configuración de precios', error);
      throw error;
    }

    return {
      precioBase: Number(fila.base_price),
      recargoVip: Number(fila.vip_surcharge)
    };
  }

  async actualizarConfiguracion(configuracion: ConfiguracionPrecios): Promise<void> {
    const { data: filas, error } = await this.supabase.client
      .from('pricing_settings')
      .update({
        base_price: configuracion.precioBase,
        vip_surcharge: configuracion.recargoVip,
        updated_at: new Date().toISOString()
      })
      .eq('id', true)
      .select();

    if (error) {
      console.error('Error al actualizar los precios', error);
      throw error;
    }
    // Sin permisos, la base no da error pero tampoco modifica nada
    if (!filas || filas.length === 0) {
      throw new Error('SIN_PERMISO');
    }
  }
}