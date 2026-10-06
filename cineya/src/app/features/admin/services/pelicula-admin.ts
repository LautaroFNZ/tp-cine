import { inject, Service } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { ClasificacionEdad, Pelicula } from '../../../core/models/pelicula.model';
import { Genero } from '../../../core/models/genero.model';

export interface DatosGuardarPelicula {
  titulo: string;
  sinopsis: string;
  imagenUrl: string;
  duracionMinutos: number;
  clasificacionEdad: ClasificacionEdad;
  fechaEstreno: string;
  precioPreventa: number | null;
  finPreventa: string | null;
}

@Service()
export class PeliculaAdminService {
  private supabase = inject(SupabaseService);

  // Todas las películas, incluidas las ocultas
  async listar(): Promise<Pelicula[]> {
    const { data, error } = await this.supabase.client
      .from('movies')
      .select(`
        id,
        titulo:title,
        sinopsis:synopsis,
        imagenUrl:image_url,
        duracionMinutos:duration_minutes,
        clasificacionEdad:age_rating,
        fechaEstreno:release_date,
        precioPreventa:presale_price,
        finPreventa:presale_ends_at,
        activa:is_active,
        creadoEn:created_at,
        generos:movie_genres(genero:genres(id, nombre:name))
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al obtener las películas', error);
      throw error;
    }

    return (data ?? []).map((pelicula: any) => ({
      ...pelicula,
      generos: pelicula.generos?.map((mg: any) => mg.genero) ?? []
    }));
  }

  // Crea la película (si no hay id) o la actualiza, y reemplaza sus géneros
  async guardar(datos: DatosGuardarPelicula, generoIds: number[], id?: string): Promise<void> {
    const fila = {
      title: datos.titulo,
      synopsis: datos.sinopsis,
      image_url: datos.imagenUrl,
      duration_minutes: datos.duracionMinutos,
      age_rating: datos.clasificacionEdad,
      release_date: datos.fechaEstreno,
      presale_price: datos.precioPreventa,
      presale_ends_at: datos.finPreventa
    };

    let peliculaId = id;
    if (peliculaId) {
      const { data: filas, error } = await this.supabase.client
        .from('movies')
        .update(fila)
        .eq('id', peliculaId)
        .select('id');

      if (error) throw error;
      // Sin permisos, la base no da error pero tampoco modifica nada
      if (!filas || filas.length === 0) throw new Error('SIN_PERMISO');
    } else {
      const { data: creada, error } = await this.supabase.client
        .from('movies')
        .insert(fila)
        .select('id')
        .single();

      if (error) throw error;
      peliculaId = creada.id;
    }

    const idFinal = peliculaId as string;

    const { error: errorBorrado } = await this.supabase.client
      .from('movie_genres')
      .delete()
      .eq('movie_id', idFinal);
    if (errorBorrado) throw errorBorrado;

    if (generoIds.length > 0) {
      const { error: errorAlta } = await this.supabase.client
        .from('movie_genres')
        .insert(generoIds.map(generoId => ({ movie_id: idFinal, genre_id: generoId })));
      if (errorAlta) throw errorAlta;
    }
  }

  async cambiarVisibilidad(id: string, activa: boolean): Promise<void> {
    const { data: filas, error } = await this.supabase.client
      .from('movies')
      .update({ is_active: activa })
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!filas || filas.length === 0) throw new Error('SIN_PERMISO');
  }

  // Sube el póster al bucket y devuelve su dirección pública
  async subirPoster(archivo: File): Promise<string> {
    const extension = archivo.type === 'image/png' ? 'png' : archivo.type === 'image/webp' ? 'webp' : 'jpg';
    const ruta = `${crypto.randomUUID()}.${extension}`;

    const { error } = await this.supabase.client.storage
      .from('posters')
      .upload(ruta, archivo, { contentType: archivo.type });
    if (error) throw error;

    return this.supabase.client.storage.from('posters').getPublicUrl(ruta).data.publicUrl;
  }

  async crearGenero(nombre: string): Promise<Genero> {
    const { data: genero, error } = await this.supabase.client
      .from('genres')
      .insert({ name: nombre })
      .select('id, nombre:name')
      .single();

    if (error) throw error;
    return genero as Genero;
  }
}
