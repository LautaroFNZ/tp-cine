import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { CategoriaProducto, Producto } from '../../../core/models/producto.model';

export interface DatosGuardarProducto {
  nombre: string;
  descripcion: string;
  categoriaId: number;
  precio: number;
  imagenUrl: string | null;
}

@Injectable({ providedIn: 'root' })
export class CandyAdminService {
  constructor(private supabase: SupabaseService) {}

  async listarCategorias(): Promise<CategoriaProducto[]> {
    const { data: categorias, error } = await this.supabase.client
      .from('product_categories')
      .select('id, nombre:name')
      .order('name');

    if (error) {
      console.error('Error al obtener las categorías', error);
      throw error;
    }
    return categorias ?? [];
  }

  async crearCategoria(nombre: string): Promise<CategoriaProducto> {
    const { data: categoria, error } = await this.supabase.client
      .from('product_categories')
      .insert({ name: nombre })
      .select('id, nombre:name')
      .single();

    if (error) {
      // 23505: ya existe una categoría con ese nombre
      if (error.code === '23505') throw new Error('CATEGORIA_REPETIDA');
      throw error;
    }
    return categoria as CategoriaProducto;
  }

  async eliminarCategoria(id: number): Promise<void> {
    const { data: filas, error } = await this.supabase.client
      .from('product_categories')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) {
      // 23503: la categoría todavía tiene productos
      if (error.code === '23503') throw new Error('CATEGORIA_CON_PRODUCTOS');
      throw error;
    }
    // Sin permisos, la base no da error pero tampoco borra nada
    if (!filas || filas.length === 0) throw new Error('SIN_PERMISO');
  }

  // Todos los productos, incluidos los ocultos
  async listarProductos(): Promise<Producto[]> {
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
      .order('created_at', { ascending: false });

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

  // Crea el producto (si no hay id) o lo actualiza
  async guardarProducto(datos: DatosGuardarProducto, id?: string): Promise<void> {
    const fila = {
      name: datos.nombre,
      description: datos.descripcion || null,
      category_id: datos.categoriaId,
      price: datos.precio,
      image_url: datos.imagenUrl
    };

    if (id) {
      const { data: filas, error } = await this.supabase.client
        .from('products')
        .update(fila)
        .eq('id', id)
        .select('id');

      if (error) throw error;
      if (!filas || filas.length === 0) throw new Error('SIN_PERMISO');
    } else {
      const { error } = await this.supabase.client.from('products').insert(fila);
      if (error) throw error;
    }
  }

  async cambiarDisponibilidad(id: string, activo: boolean): Promise<void> {
    const { data: filas, error } = await this.supabase.client
      .from('products')
      .update({ is_active: activo })
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!filas || filas.length === 0) throw new Error('SIN_PERMISO');
  }

  // Sube la imagen al bucket y devuelve su dirección pública
  async subirImagen(archivo: File): Promise<string> {
    const extension = archivo.type === 'image/png' ? 'png' : archivo.type === 'image/webp' ? 'webp' : 'jpg';
    const ruta = `${crypto.randomUUID()}.${extension}`;

    const { error } = await this.supabase.client.storage
      .from('products')
      .upload(ruta, archivo, { contentType: archivo.type });
    if (error) throw error;

    return this.supabase.client.storage.from('products').getPublicUrl(ruta).data.publicUrl;
  }
}