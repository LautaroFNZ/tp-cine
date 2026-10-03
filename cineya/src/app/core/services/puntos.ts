import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { MovimientoPuntos, Recompensa } from '../models/recompensa.model';

@Injectable({ providedIn: 'root' })
export class PuntosService {
  constructor(private supabase: SupabaseService) {}

  // Saldo del usuario con sesión: es la suma de sus movimientos de puntos
  async obtenerSaldo(): Promise<number> {
    const { data, error } = await this.supabase.client.rpc('get_points_balance');
    if (error) throw error;
    return Number(data ?? 0);
  }

  // Recompensas disponibles para canjear (el público solo ve las activas)
  async listarRecompensas(): Promise<Recompensa[]> {
    const { data: filas, error } = await this.supabase.client
      .from('rewards')
      .select(`
        id,
        tipo:kind,
        productoId:product_id,
        puntos:points_cost,
        activa:is_active,
        producto:products(name)
      `)
      .eq('is_active', true);

    if (error) {
      console.error('Error al obtener las recompensas', error);
      throw error;
    }

    return (filas ?? [])
      .map((fila: any): Recompensa => ({
        id: fila.id,
        tipo: fila.tipo === 'ticket' ? 'entrada' : 'producto',
        productoId: fila.productoId,
        nombre: fila.tipo === 'ticket' ? 'Entrada gratis' : (fila.producto?.name ?? ''),
        puntos: fila.puntos,
        activa: fila.activa
      }))
      // Si el producto está oculto, no se puede canjear
      .filter(recompensa => recompensa.nombre !== '')
      .sort((a, b) =>
        a.tipo === b.tipo ? a.nombre.localeCompare(b.nombre) : a.tipo === 'entrada' ? -1 : 1
      );
  }

  // Historial de puntos del usuario con sesión, del más nuevo al más viejo
  async listarMovimientos(): Promise<MovimientoPuntos[]> {
    const { data: filas, error } = await this.supabase.client
      .from('points_movements')
      .select(`
        id,
        tipo:type,
        puntos:points,
        cantidad:quantity,
        descripcion:description,
        fecha:created_at,
        compra:purchases(code)
      `)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error al obtener los movimientos de puntos', error);
      throw error;
    }

    return (filas ?? []).map((fila: any): MovimientoPuntos => ({
      id: fila.id,
      tipo: fila.tipo === 'earned' ? 'ganado' : fila.tipo === 'redeemed' ? 'canjeado' : 'ajuste',
      puntos: fila.puntos,
      cantidad: fila.cantidad,
      descripcion: fila.descripcion,
      fecha: fila.fecha,
      codigoCompra: fila.compra?.code ?? null
    }));
  }
}