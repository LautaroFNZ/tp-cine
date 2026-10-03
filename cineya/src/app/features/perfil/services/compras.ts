import { Injectable } from '@angular/core';
import { SupabaseService } from '../../../core/services/supabase.service';
import { Compra } from '../../../core/models/compra.model';

@Injectable({ providedIn: 'root' })
export class CompraService {
  constructor(private supabase: SupabaseService) {}

  async listarDelUsuario(usuarioId: string): Promise<Compra[]> {
    const { data: filas, error } = await this.supabase.client
      .from('purchases')
      .select(`
        id,
        codigo:code,
        estadoCompra:status,
        total,
        subtotal,
        descuento:discount_amount,
        descuentoEtiqueta:discount_label,
        creditoPuntos:reward_credit,
        puntosGanados:points_earned,
        creditoUsado:credit_used,
        creditoDevuelto:credit_refunded,
        creadaEn:created_at,
        metodoPago:payment_method,
        entradaUsadaEn:entry_validated_at,
        candyEntregadoEn:candy_delivered_at,
        entradas:tickets(
          precio:price,
          asiento:seats(fila:row_label, numero:seat_number, tipo:seat_type),
          funcion:showtimes(
            inicio:starts_at,
            fin:ends_at,
            formato:format,
            idioma:language,
            sala:rooms(name),
            pelicula:movies(title, age_rating)
          )
        ),
        productos:purchase_items(
          cantidad:quantity,
          precioUnitario:unit_price,
          puntos:points_spent,
          producto:products(name)
        )
      `)
      .eq('user_id', usuarioId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al obtener las compras', error);
      throw error;
    }

    return (filas ?? [])
      .filter((fila: any) => fila.entradas?.length > 0)
      .map((fila: any): Compra => {
        // Todas las entradas de una compra son de la misma función
        const funcion = fila.entradas[0].funcion;

        return {
          id: fila.id,
          codigo: fila.codigo,
          total: Number(fila.total),
          subtotal: fila.subtotal !== null ? Number(fila.subtotal) : Number(fila.total),
          descuento: Number(fila.descuento ?? 0),
          descuentoEtiqueta: fila.descuentoEtiqueta,
          creditoPuntos: Number(fila.creditoPuntos ?? 0),
          puntosGanados: Number(fila.puntosGanados ?? 0),
          creditoUsado: Number(fila.creditoUsado ?? 0),
          creditoDevuelto: Number(fila.creditoDevuelto ?? 0),
          cancelada: fila.estadoCompra === 'cancelled',
          creadaEn: fila.creadaEn,
          metodoPago: fila.metodoPago,
          entradaUsada: !!fila.entradaUsadaEn,
          candyEntregado: !!fila.candyEntregadoEn,
          pelicula: funcion.pelicula?.title ?? '',
          clasificacionEdad: funcion.pelicula?.age_rating ?? 'none',
          sala: funcion.sala?.name ?? '',
          formato: funcion.formato,
          idioma: funcion.idioma,
          inicio: funcion.inicio,
          fin: funcion.fin,
          entradas: fila.entradas
            .map((entrada: any) => ({
              fila: entrada.asiento.fila,
              numero: entrada.asiento.numero,
              tipo: entrada.asiento.tipo,
              precio: Number(entrada.precio)
            }))
            .sort((a: any, b: any) => a.fila.localeCompare(b.fila) || a.numero - b.numero),
          productos: (fila.productos ?? []).map((item: any) => ({
            nombre: item.producto?.name ?? 'Producto',
            cantidad: item.cantidad,
            precioUnitario: Number(item.precioUnitario),
            puntos: Number(item.puntos ?? 0)
          }))
        };
      });
  }
}