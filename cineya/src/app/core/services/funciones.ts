import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import {
  DatosProgramacion,
  Funcion,
  ResultadoProgramacion
} from '../models/funcion.model';

const CAMPOS_FUNCION = `
  id,
  peliculaId:movie_id,
  salaId:room_id,
  sala:rooms(name),
  pelicula:movies(title, clasificacionEdad:age_rating),
  inicio:starts_at,
  fin:ends_at,
  formato:format,
  idioma:language
`;

@Injectable({ providedIn: 'root' })
export class FuncionService {
  constructor(private supabase: SupabaseService) {}

  async obtenerProximasPorPelicula(peliculaId: string): Promise<Funcion[]> {
    const { data: funciones, error } = await this.supabase.client
      .from('showtimes')
      .select(CAMPOS_FUNCION)
      .eq('movie_id', peliculaId)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at');

    if (error) {
      console.error('Error al obtener las funciones', error);
      throw error;
    }
    return this.convertir(funciones);
  }

  async obtenerProximas(limite = 50): Promise<Funcion[]> {
    const { data: funciones, error } = await this.supabase.client
      .from('showtimes')
      .select(CAMPOS_FUNCION)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at')
      .limit(limite);

    if (error) {
      console.error('Error al obtener las funciones', error);
      throw error;
    }
    return this.convertir(funciones);
  }

  // Llama a la función de la base que asigna la sala automáticamente
  async programar(datos: DatosProgramacion): Promise<ResultadoProgramacion[]> {
    const { data: filas, error } = await this.supabase.client.rpc('schedule_showtimes', {
      p_movie_id: datos.peliculaId,
      p_weekdays: datos.diasSemana,
      p_time: datos.hora,
      p_from: datos.desde,
      p_to: datos.hasta,
      p_format: datos.formato,
      p_language: datos.idioma
    });

    if (error) {
      console.error('Error al programar funciones', error);
      throw error;
    }

    return (filas ?? []).map((fila: any) => ({
      fecha: fila.out_date,
      sala: fila.out_room,
      estado: fila.out_status
    }));
  }

  async eliminar(id: string): Promise<void> {
    const { error } = await this.supabase.client.from('showtimes').delete().eq('id', id);
    if (error) {
      console.error('Error al eliminar la función', error);
      throw error;
    }
  }

   async obtenerPorId(id: string): Promise<Funcion | null> {
    const { data: funcion, error } = await this.supabase.client
        .from('showtimes')
        .select(CAMPOS_FUNCION)
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error al obtener la función', error);
        return null;
    }
    return this.convertir([funcion])[0];
    }

    private convertir(filas: any[] | null): Funcion[] {
        return (filas ?? []).map((fila: any) => ({
            ...fila,
            sala: fila.sala?.name ?? '',
            clasificacionEdad: fila.pelicula?.clasificacionEdad ?? 'none',
            pelicula: fila.pelicula?.title ?? ''
        }));
    }
}