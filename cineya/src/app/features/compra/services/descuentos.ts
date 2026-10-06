import { inject, Service } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';

export interface VistaDescuento {
  porcentaje: number;
  etiqueta: string | null;
  monto: number;
  cuponAplicado: boolean;   // false si ganó el descuento de bienvenida
}

@Service()
export class DescuentoService {
  private supabase = inject(SupabaseService);

  // Pregunta a la base qué descuento le corresponde al usuario (con o sin cupón) para un subtotal
  async calcular(cupon: string, subtotal: number): Promise<VistaDescuento> {
    const { data, error } = await this.supabase.client.rpc('preview_discount', {
      p_coupon_code: cupon || null,
      p_subtotal: subtotal
    });

    if (error) this.lanzarError(error.message);

    return {
      porcentaje: Number(data.percent),
      etiqueta: data.label,
      monto: Number(data.amount),
      cuponAplicado: !!data.coupon_applied
    };
  }

  // Porcentaje del descuento de bienvenida, para mostrarlo a cualquier visitante
  async obtenerPorcentajeBienvenida(): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('get_welcome_discount');
    if (error) throw error;
    return Number(data ?? 0);
  }

  private lanzarError(mensaje: string): never {
    if (mensaje.includes('coupon_invalid')) throw new Error('CUPON_INVALIDO');
    if (mensaje.includes('coupon_login_required')) throw new Error('CUPON_SESION');
    if (mensaje.includes('coupon_age')) throw new Error('CUPON_EDAD');
    if (mensaje.includes('coupon_used')) throw new Error('CUPON_USADO');
    console.error('Error al calcular el descuento', mensaje);
    throw new Error(mensaje);
  }
}
