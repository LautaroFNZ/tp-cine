import { Service, inject } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';

export interface Sala {
  id: string;
  nombre: string;
  butacas: number;
  creadaEn: string;
}

@Service()
export class SalaAdminService {
  private supabase = inject(SupabaseService);

  // Todas las salas, con la cantidad de butacas que tiene cada una
  async listar(): Promise<Sala[]> {
    const { data: filas, error } = await this.supabase.client
      .from('rooms')
      .select('id, nombre:name, creadaEn:created_at, butacas:seats(count)')
      .order('name');

    if (error) {
      console.error('Error al obtener las salas', error);
      throw error;
    }

    return (filas ?? []).map((fila: any): Sala => ({
      id: fila.id,
      nombre: fila.nombre,
      creadaEn: fila.creadaEn,
      butacas: fila.butacas?.[0]?.count ?? 0
    }));
  }

  // Crea una sala. Sus butacas las genera sola un trigger de la base.
  async crear(nombre: string): Promise<void> {
    const { error } = await this.supabase.client.from('rooms').insert({ name: nombre });

    if (error) {
      // 23505: ya existe una sala con ese nombre
      if (error.code === '23505') throw new Error('SALA_REPETIDA');
      // 42501: las políticas de seguridad lo rechazaron (el usuario no es administrador)
      if (error.code === '42501') throw new Error('SIN_PERMISO');
      console.error('Error al crear la sala', error);
      throw error;
    }
  }
}