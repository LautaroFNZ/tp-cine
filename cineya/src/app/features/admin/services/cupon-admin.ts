import { inject, Service } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Cupon } from '../../../core/models/cupon.model';

export interface DatosCrearCupon {
  codigo: string;
  porcentaje: number;
  edadMinima: number | null;
}

@Service()
export class CuponAdminService {
  private supabase = inject(SupabaseService);

  async obtenerDescuentoBienvenida(): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('pricing_settings')
      .select('welcome_discount_percent')
      .single();

    if (error) throw error;
    return Number(data.welcome_discount_percent);
  }

  async actualizarDescuentoBienvenida(porcentaje: number): Promise<void> {
    const { data: filas, error } = await this.supabase.client
      .from('pricing_settings')
      .update({ welcome_discount_percent: porcentaje })
      .eq('id', true)
      .select('id');

    if (error) throw error;
    // Sin permisos, la base no da error pero tampoco modifica nada
    if (!filas || filas.length === 0) throw new Error('SIN_PERMISO');
  }

  async listar(): Promise<Cupon[]> {
    const { data, error } = await this.supabase.client
      .from('coupons')
      .select(`
        id,
        codigo:code,
        porcentaje:discount_percent,
        edadMinima:min_age,
        activo:is_active,
        usos:coupon_redemptions(count)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al obtener los cupones', error);
      throw error;
    }

    return (data ?? []).map((cupon: any) => ({
      ...cupon,
      usos: cupon.usos?.[0]?.count ?? 0
    }));
  }

  async crear(datos: DatosCrearCupon): Promise<void> {
    const { error } = await this.supabase.client.from('coupons').insert({
      code: datos.codigo,
      discount_percent: datos.porcentaje,
      min_age: datos.edadMinima
    });

    if (error) {
      // 23505: ya existe un cupón con ese código
      if (error.code === '23505') throw new Error('CUPON_REPETIDO');
      throw error;
    }
  }

  async cambiarEstado(id: string, activo: boolean): Promise<void> {
    const { data: filas, error } = await this.supabase.client
      .from('coupons')
      .update({ is_active: activo })
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!filas || filas.length === 0) throw new Error('SIN_PERMISO');
  }
}
