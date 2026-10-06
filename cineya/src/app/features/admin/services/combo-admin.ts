import { inject, Service } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Combo } from '../../../core/models/combo.model';

export interface DatosGuardarCombo {
  nombre: string;
  descripcion: string;
  precio: number;
  entradasIncluidas: number;
  imagenUrl: string | null;
  incluye: { productoId: string; cantidad: number }[];
}

@Service()
export class ComboAdminService {
  private supabase = inject(SupabaseService);

  // Todos los combos, incluidos los ocultos
  async listar(): Promise<Combo[]> {
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
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al obtener los combos', error);
      throw error;
    }

    return (combos ?? []).map((combo: any): Combo => ({
      id: combo.id,
      nombre: combo.nombre,
      descripcion: combo.descripcion,
      precio: Number(combo.precio),
      entradasIncluidas: combo.entradasIncluidas,
      imagenUrl: combo.imagenUrl,
      activo: combo.activo,
      incluye: (combo.incluye ?? []).map((item: any) => ({
        productoId: item.producto?.id ?? '',
        nombre: item.producto?.nombre ?? 'Producto',
        precio: Number(item.producto?.precio ?? 0),
        cantidad: item.cantidad
      }))
    }));
  }

  // Crea el combo (si no hay id) o lo actualiza, con sus productos, en una sola transacción
  async guardar(datos: DatosGuardarCombo, id?: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('save_combo', {
      p_id: id ?? null,
      p_name: datos.nombre,
      p_description: datos.descripcion,
      p_price: datos.precio,
      p_tickets: datos.entradasIncluidas,
      p_image_url: datos.imagenUrl,
      p_items: datos.incluye.map(item => ({ product_id: item.productoId, quantity: item.cantidad }))
    });

    if (error) {
      if (error.message.includes('not_admin')) throw new Error('SIN_PERMISO');
      console.error('Error al guardar el combo', error);
      throw error;
    }
  }

  async cambiarDisponibilidad(id: string, activo: boolean): Promise<void> {
    const { data: filas, error } = await this.supabase.client
      .from('combos')
      .update({ is_active: activo })
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!filas || filas.length === 0) throw new Error('SIN_PERMISO');
  }
}
