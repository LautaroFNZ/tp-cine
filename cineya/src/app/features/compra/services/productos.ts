import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Producto } from '../../../core/models/producto.model';

@Injectable({ providedIn: 'root' })
export class ProductoService {
  constructor(private supabase: SupabaseService) {}

  // El público solo ve los productos disponibles (lo garantiza RLS)
  async listarDisponibles(): Promise<Producto[]> {
    const { data: productos, error } = await this.supabase.client
      .from('products')
      .select(`
        id,
        categoriaId:category_id,
        categoria:product_categories(name),
        nombre:name,
        descripcion:description,
        precio:price,
        imagenUrl:image_url,
        activo:is_active
      `)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error al obtener los productos', error);
      throw error;
    }

    return (productos ?? []).map((producto: any) => ({
      ...producto,
      categoria: producto.categoria?.name ?? '',
      precio: Number(producto.precio)
    }));
  }
}