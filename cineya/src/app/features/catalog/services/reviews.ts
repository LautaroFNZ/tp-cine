import { Service , inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Review } from '../../../core/models/review.model';

@Service()
export class ReviewService {
  private supabase = inject(SupabaseService);

  async obtenerPorPelicula(peliculaId: string): Promise<Review[]> {
    const { data: reviews, error } = await this.supabase.client
      .from('reviews')
      .select(`
        id,
        peliculaId:movie_id,
        usuarioId:user_id,
        puntaje:rating,
        comentario:comment,
        autor:author_name,
        creadoEn:created_at
      `)
      .eq('movie_id', peliculaId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al obtener las reviews', error);
      throw error;
    }

    return reviews ?? [];
  }

  // Si el usuario ya dejó una review para esta película, la actualiza en vez de crear otra
  async guardar(
    peliculaId: string,
    usuarioId: string,
    puntaje: number,
    comentario: string
  ): Promise<void> {
    const { error } = await this.supabase.client
      .from('reviews')
      .upsert(
        {
          movie_id: peliculaId,
          user_id: usuarioId,
          rating: puntaje,
          comment: comentario || null
        },
        { onConflict: 'movie_id,user_id' }
      );

    if (error) {
      console.error('Error al guardar la review', error);
      throw error;
    }
  }
}