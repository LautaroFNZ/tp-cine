import { Service, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AlertaEstreno } from '../../../core/models/alerta.model';

@Service()
export class AlertaService {
  private supabase = inject(SupabaseService);

  // Alertas del usuario con sesión (RLS: cada usuario ve solo las suyas)
  async listarMias(): Promise<AlertaEstreno[]> {
    const { data: filas, error } = await this.supabase.client
      .from('release_alerts')
      .select(`
        peliculaId:movie_id,
        vistaEn:seen_at,
        pelicula:movies(titulo:title, imagenUrl:image_url, fechaEstreno:release_date)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al obtener las alertas', error);
      throw error;
    }

    return (filas ?? [])
      // Si la película está oculta, la alerta no se muestra
      .filter((fila: any) => fila.pelicula)
      .map((fila: any): AlertaEstreno => ({
        peliculaId: fila.peliculaId,
        titulo: fila.pelicula.titulo,
        imagenUrl: fila.pelicula.imagenUrl,
        fechaEstreno: fila.pelicula.fechaEstreno,
        vista: fila.vistaEn !== null
      }));
  }

  // El usuario se anota para que le avisen cuando abra la venta.
  // El usuario lo completa la base (user_id = auth.uid()), no el navegador.
  async activar(peliculaId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('release_alerts')
      .insert({ movie_id: peliculaId });

    // 23505 = ya tenía la alerta activada: no es un problema
    if (error && error.code !== '23505') {
      console.error('Error al activar la alerta', error);
      throw error;
    }
  }

  async desactivar(peliculaId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('release_alerts')
      .delete()
      .eq('movie_id', peliculaId);

    if (error) {
      console.error('Error al desactivar la alerta', error);
      throw error;
    }
  }

  // El usuario ya vio el aviso de que abrió la venta
  async marcarVista(peliculaId: string): Promise<void> {
    const { error } = await this.supabase.client
      .from('release_alerts')
      .update({ seen_at: new Date().toISOString() })
      .eq('movie_id', peliculaId);

    if (error) {
      console.error('Error al marcar la alerta como vista', error);
      throw error;
    }
  }
}