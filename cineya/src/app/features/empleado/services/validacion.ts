import { inject, Service } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';

@Service()
export class ValidacionService {
  private supabase = inject(SupabaseService);

  // Marca la entrada como utilizada. Después de esto, el código ya no sirve para entrar.
  async validarEntrada(codigo: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('validate_entry', { p_code: codigo });
    if (error) this.lanzarError(error.message);
  }

  // Marca los productos del candy bar como retirados.
  async entregarCandy(codigo: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('deliver_candy', { p_code: codigo });
    if (error) this.lanzarError(error.message);
  }

  private lanzarError(mensaje: string): never {
    if (mensaje.includes('already_used')) throw new Error('YA_UTILIZADA');
    if (mensaje.includes('already_delivered')) throw new Error('YA_ENTREGADO');
    if (mensaje.includes('no_candy')) throw new Error('SIN_CANDY');
    if (mensaje.includes('purchase_not_found')) throw new Error('NO_ENCONTRADA');
    if (mensaje.includes('not_staff')) throw new Error('SIN_PERMISO');
    if (mensaje.includes('too_early')) throw new Error('OTRO_DIA');
    if (mensaje.includes('function_ended')) throw new Error('FUNCION_TERMINADA');
    if (mensaje.includes('cancelled')) throw new Error('CANCELADA');
    console.error('Error en la validación', mensaje);
    throw new Error(mensaje);
  }
}
