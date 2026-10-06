import { inject, Service } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { MovimientoCredito } from '../models/credito.model';

@Service()
export class CreditoService {
  private supabase = inject(SupabaseService);

  // Crédito del usuario con sesión: es la suma de sus movimientos
  async obtenerSaldo(): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('get_credit_balance');
    if (error) throw error;
    return Number(data ?? 0);
  }

  // Historial del crédito, del más nuevo al más viejo
  async listarMovimientos(): Promise<MovimientoCredito[]> {
    const { data: filas, error } = await this.supabase.client
      .from('credit_movements')
      .select(`
        id,
        tipo:type,
        monto:amount,
        descripcion:description,
        fecha:created_at,
        compra:purchases(code)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al obtener los movimientos de crédito', error);
      throw error;
    }

    return (filas ?? []).map((fila: any): MovimientoCredito => ({
      id: fila.id,
      tipo: fila.tipo === 'cancellation' ? 'cancelacion' : 'uso',
      monto: Number(fila.monto),
      descripcion: fila.descripcion,
      fecha: fila.fecha,
      codigoCompra: fila.compra?.code ?? null
    }));
  }

  // Cancela la compra y devuelve el crédito que se acreditó en la cuenta
  async cancelarCompra(compraId: string): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('cancel_purchase', {
      p_purchase_id: compraId
    });

    if (error) this.lanzarError(error.message);
    return Number(data ?? 0);
  }

  private lanzarError(mensaje: string): never {
    if (mensaje.includes('too_late')) throw new Error('FUERA_DE_PLAZO');
    if (mensaje.includes('already_used')) throw new Error('YA_UTILIZADA');
    if (mensaje.includes('already_cancelled')) throw new Error('YA_CANCELADA');
    if (mensaje.includes('purchase_not_found')) throw new Error('NO_ENCONTRADA');
    if (mensaje.includes('login_required')) throw new Error('SIN_SESION');
    console.error('Error al cancelar la compra', mensaje);
    throw new Error(mensaje);
  }
}
