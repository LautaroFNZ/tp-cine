import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Butaca } from '../../../core/models/butaca.model';

@Injectable({ providedIn: 'root' })
export class ButacaService {
  constructor(private supabase: SupabaseService) {}

  async obtenerPorSala(salaId: string): Promise<Butaca[]> {
    const { data: butacas, error } = await this.supabase.client
      .from('seats')
      .select(`
        id,
        fila:row_label,
        ordenFila:row_order,
        bloque:block,
        numero:seat_number,
        tipo:seat_type
      `)
      .eq('room_id', salaId)
      .order('row_order')
      .order('seat_number');

    if (error) {
      console.error('Error al obtener las butacas', error);
      throw error;
    }
    return butacas ?? [];
  }

  async obtenerOcupadas(funcionId: string): Promise<string[]> {
    const { data: filas, error } = await this.supabase.client
      .from('occupied_seats')
      .select('seat_id')
      .eq('showtime_id', funcionId);

    if (error) {
      console.error('Error al obtener la ocupación', error);
      throw error;
    }
    return (filas ?? []).map((fila: any) => fila.seat_id);
  }

  // Escucha en vivo las butacas que se ocupan o se liberan. Devuelve la función para cancelar la suscripción.
  suscribirseAOcupacion(
    funcionId: string,
    alOcuparse: (butacaId: string) => void,
    alLiberarse: (butacaId: string) => void,
    alConectar: () => void
  ): () => void {
    const canal = this.supabase.client
      .channel(`ocupacion-${funcionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'occupied_seats', filter: `showtime_id=eq.${funcionId}` },
        (cambio: any) => alOcuparse(cambio.new.seat_id)
      )
      // Los DELETE no se pueden filtrar en el servidor: se descartan acá los de otras funciones
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'occupied_seats' },
        (cambio: any) => {
          if (cambio.old.showtime_id === funcionId) alLiberarse(cambio.old.seat_id);
        }
      )
      .subscribe((estado) => {
        if (estado === 'SUBSCRIBED') alConectar();
      });

    return () => {
      this.supabase.client.removeChannel(canal);
    };
  }

    async confirmar(funcionId: string, butacaIds: string[]): Promise<string> {
    const { data: compraId, error } = await this.supabase.client.rpc('buy_tickets', {
      p_showtime_id: funcionId,
      p_seat_ids: butacaIds
    });

    if (error) {
      if (error.message.includes('seat_taken')) throw new Error('BUTACA_OCUPADA');
      if (error.message.includes('age_restricted')) throw new Error('EDAD_NO_PERMITIDA');
      if (error.message.includes('login_required')) throw new Error('SESION_REQUERIDA');
      console.error('Error al confirmar las butacas', error);
      throw error;
    }
    return compraId as string;
    }
}