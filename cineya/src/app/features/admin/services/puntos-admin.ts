import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';

export interface RecompensaAdmin {
  id: string;
  tipo: 'entrada' | 'producto';
  productoId: string | null;
  puntos: number;
  activa: boolean;
}

@Injectable({ providedIn: 'root' })
export class PuntosAdminService {
  constructor(private supabase: SupabaseService) {}

  // Todas las recompensas, incluidas las desactivadas
  async listarRecompensas(): Promise<RecompensaAdmin[]> {
    const { data: filas, error } = await this.supabase.client
      .from('rewards')
      .select('id, tipo:kind, productoId:product_id, puntos:points_cost, activa:is_active');

    if (error) {
      console.error('Error al obtener las recompensas', error);
      throw error;
    }

    return (filas ?? []).map((fila: any): RecompensaAdmin => ({
      id: fila.id,
      tipo: fila.tipo === 'ticket' ? 'entrada' : 'producto',
      productoId: fila.productoId,
      puntos: fila.puntos,
      activa: fila.activa
    }));
  }

  // Crea o actualiza una recompensa (la función de la base verifica que sea administrador)
  async guardarRecompensa(
    tipo: 'entrada' | 'producto',
    productoId: string | null,
    puntos: number,
    activa: boolean
  ): Promise<void> {
    const { error } = await this.supabase.client.rpc('save_reward', {
      p_kind: tipo === 'entrada' ? 'ticket' : 'product',
      p_product_id: productoId,
      p_points: puntos,
      p_active: activa
    });

    if (error) {
      if (error.message.includes('not_admin')) throw new Error('SIN_PERMISO');
      console.error('Error al guardar la recompensa', error);
      throw error;
    }
  }
}