import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Pelicula } from '../../../core/models/pelicula.model';
import { Genero } from '../../../core/models/genero.model';

@Injectable({ providedIn: 'root' })
export class MovieService {
  constructor(private supabase: SupabaseService) {}

  async obtenerPeliculas(): Promise<Pelicula[]> {
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
        creadoEn:created_at,
        generos:movie_genres(genero:genres(id, nombre:name))
      `)
      .order('release_date', { ascending: false });

    if (error) {
      console.error('Error al obtener las películas', error);
      throw error;
    }

    return (data ?? []).map((pelicula: any) => ({
      ...pelicula,
      generos: pelicula.generos?.map((mg: any) => mg.genero) ?? []
    }));
  }

  async obtenerGeneros(): Promise<Genero[]> {
    const { data, error } = await this.supabase.client
      .from('genres')
      .select('id, nombre:name')
      .order('name');

    if (error) {
      console.error('Error al obtener los géneros', error);
      throw error;
    }

    return data ?? [];
  }

  async obtenerPeliculaPorId(id: string): Promise<Pelicula | null> {
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
      creadoEn:created_at,
      generos:movie_genres(genero:genres(id, nombre:name))
    `)
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error al obtener la película', error);
    return null;
  }

  return {
    ...data,
    generos: data.generos?.map((mg: any) => mg.genero) ?? []
  };
}
}