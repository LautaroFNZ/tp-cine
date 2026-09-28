import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Pelicula } from '../../../core/models/pelicula.model';

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
}