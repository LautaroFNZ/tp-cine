import { Service, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Combo } from '../../../core/models/combo.model';

@Service()
export class ComboService {
  private supabase = inject(SupabaseService);

  // El público solo ve los combos disponibles (lo garantiza RLS)
  async listarDisponibles(): Promise<Combo[]> {
    const { data: combos, error } = await this.supabase.client
      .from('combos')
      .select(`
        id,
        nombre:name,
        descripcion:description,
        precio:price,
        entradasIncluidas:tickets_included,
        imagenUrl:image_url,
        activo:is_active,
        incluye:combo_items(
          cantidad:quantity,
          producto:products(id, nombre:name, precio:price)
        )
      `)
      .eq('is_active', true)
      .order('price');

    if (error) {
      console.error('Error al obtener los combos', error);
      throw error;
    }

    return (combos ?? [])
      .map((combo: any): Combo => ({
        id: combo.id,
        nombre: combo.nombre,
        descripcion: combo.descripcion,
        precio: Number(combo.precio),
        entradasIncluidas: combo.entradasIncluidas,
        imagenUrl: combo.imagenUrl,
        activo: combo.activo,
        incluye: (combo.incluye ?? []).map((item: any) => ({
          productoId: item.producto?.id ?? '',
          nombre: item.producto?.nombre ?? '',
          precio: Number(item.producto?.precio ?? 0),
          cantidad: item.cantidad
        }))
      }))
      // Si algún producto del combo está oculto, el combo no se ofrece
      .filter(combo => combo.incluye.length > 0 && combo.incluye.every(item => item.productoId !== ''));
  }
}