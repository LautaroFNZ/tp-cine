import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Compra } from '../../../core/models/compra.model';

@Injectable({ providedIn: 'root' })
export class EntradaService {
  constructor(private supabase: SupabaseService) {}

  // Devuelve null si no existe una compra con ese código
  async obtenerPorCodigo(codigo: string): Promise<Compra | null> {
    const { data, error } = await this.supabase.client.rpc('get_ticket', { p_code: codigo });

    if (error) {
      console.error('Error al obtener la entrada', error);
      throw error;
    }
    if (!data) return null;

    return {
      id: data.code,
      codigo: data.code,
      total: Number(data.total),
      creadaEn: data.created_at,
      metodoPago: data.payment_method,
      pelicula: data.movie,
      clasificacionEdad: data.age_rating,
      sala: data.room,
      formato: data.format,
      idioma: data.language,
      inicio: data.starts_at,
      fin: data.ends_at,
      entradas: (data.seats ?? []).map((butaca: any) => ({
        fila: butaca.row,
        numero: butaca.number,
        tipo: butaca.type,
        precio: Number(butaca.price)
      })),
      productos: (data.items ?? []).map((item: any) => ({
        nombre: item.name,
        cantidad: item.quantity,
        precioUnitario: Number(item.unit_price)
      })),
      entradaUsada: data.entry_used,
      candyEntregado: data.candy_delivered
    };
  }

  // Genera el QR como imagen. La librería se carga solo cuando hace falta.
  async generarQr(texto: string): Promise<string> {
    const modulo: any = await import('qrcode');
    const QRCode = modulo.default ?? modulo;
    return QRCode.toDataURL(texto, { width: 512, margin: 1 });
  }
}