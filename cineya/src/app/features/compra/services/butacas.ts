import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Butaca } from '../../../core/models/butaca.model';

export interface ReservaAjena {
  butacaId: string;
  vence: number;
}

export interface ItemCompra {
  productoId: string;
  cantidad: number;
}

export interface ResultadoCompra {
  compraId: string;
  codigo: string;
}

interface Escuchas {
  alOcuparse: (butacaId: string) => void;
  alLiberarse: (butacaId: string) => void;
  alReservarse: (butacaId: string, vence: number) => void;
  alLiberarseReserva: (butacaId: string) => void;
  alConectar: () => void;
}

@Injectable({ providedIn: 'root' })
export class ButacaService {
  private readonly claveToken = 'cineya_token_reserva';

  constructor(private supabase: SupabaseService) {}

  // Identifica a este visitante (con o sin cuenta) mientras dure la pestaña
  private get token(): string {
    let token = sessionStorage.getItem(this.claveToken);
    if (!token) {
      token = crypto.randomUUID();
      sessionStorage.setItem(this.claveToken, token);
    }
    return token;
  }

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

  // Reservas vigentes de la función (incluye las propias)
  async obtenerReservas(funcionId: string): Promise<ReservaAjena[]> {
    const { data: filas, error } = await this.supabase.client
      .from('seat_holds')
      .select('seat_id, expires_at')
      .eq('showtime_id', funcionId)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      console.error('Error al obtener las reservas', error);
      throw error;
    }
    return (filas ?? []).map((fila: any) => ({
      butacaId: fila.seat_id,
      vence: Date.parse(fila.expires_at)
    }));
  }

  // Reserva las butacas. Devuelve cuántos segundos dura la reserva.
  async reservar(funcionId: string, butacaIds: string[]): Promise<number> {
    const { data: segundos, error } = await this.supabase.client.rpc('hold_seats', {
      p_showtime_id: funcionId,
      p_seat_ids: butacaIds,
      p_token: this.token
    });

    if (error) this.lanzarError(error.message);
    return Number(segundos);
  }

  async liberar(funcionId: string): Promise<void> {
    const { error } = await this.supabase.client.rpc('release_seats', {
      p_showtime_id: funcionId,
      p_token: this.token
    });
    if (error) console.error('Error al liberar la reserva', error);
  }

  // Convierte la reserva en compra, con los productos elegidos y el cupón (si hay).
  // Devuelve el código de la compra.
  async comprar(
    funcionId: string,
    butacaIds: string[],
    items: ItemCompra[],
    metodoPago: 'card' | 'wallet',
    cupon: string | null = null
  ): Promise<ResultadoCompra> {
    const { data: filas, error } = await this.supabase.client.rpc('complete_purchase', {
      p_showtime_id: funcionId,
      p_seat_ids: butacaIds,
      p_token: this.token,
      p_items: items.map(item => ({ product_id: item.productoId, quantity: item.cantidad })),
      p_payment_method: metodoPago,
      p_coupon_code: cupon
    });

    if (error) this.lanzarError(error.message);

    const fila = filas?.[0];
    return { compraId: fila.out_purchase_id, codigo: fila.out_code };
  }

  // Escucha en vivo las ocupaciones y las reservas. Devuelve la función para cancelar.
  suscribirse(funcionId: string, escuchas: Escuchas): () => void {
    const canal = this.supabase.client
      .channel(`compra-${funcionId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'occupied_seats', filter: `showtime_id=eq.${funcionId}` },
        (cambio: any) => escuchas.alOcuparse(cambio.new.seat_id)
      )
      // Los DELETE no se pueden filtrar en el servidor: se descartan acá los de otras funciones
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'occupied_seats' },
        (cambio: any) => {
          if (cambio.old.showtime_id === funcionId) escuchas.alLiberarse(cambio.old.seat_id);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'seat_holds', filter: `showtime_id=eq.${funcionId}` },
        (cambio: any) => escuchas.alReservarse(cambio.new.seat_id, Date.parse(cambio.new.expires_at))
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'seat_holds' },
        (cambio: any) => {
          if (cambio.old.showtime_id === funcionId) escuchas.alLiberarseReserva(cambio.old.seat_id);
        }
      )
      .subscribe((estado) => {
        if (estado === 'SUBSCRIBED') escuchas.alConectar();
      });

    return () => {
      this.supabase.client.removeChannel(canal);
    };
  }

  private lanzarError(mensaje: string): never {
    if (mensaje.includes('seat_taken')) throw new Error('BUTACA_OCUPADA');
    if (mensaje.includes('age_restricted')) throw new Error('EDAD_NO_PERMITIDA');
    if (mensaje.includes('login_required')) throw new Error('SESION_REQUERIDA');
    if (mensaje.includes('hold_expired')) throw new Error('RESERVA_VENCIDA');
    if (mensaje.includes('product_unavailable')) throw new Error('PRODUCTO_NO_DISPONIBLE');
    if (mensaje.includes('coupon_invalid')) throw new Error('CUPON_INVALIDO');
    if (mensaje.includes('coupon_login_required')) throw new Error('CUPON_SESION');
    if (mensaje.includes('coupon_age')) throw new Error('CUPON_EDAD');
    if (mensaje.includes('coupon_used')) throw new Error('CUPON_USADO');
    console.error('Error en la compra', mensaje);
    throw new Error(mensaje);
  }
}
