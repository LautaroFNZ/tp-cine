import { Injectable, computed, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { Perfil } from '../models/perfil.model';

export interface DatosRegistro {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  fechaNacimiento: string;
  tipoSangre: string;
  colorOjos: string;
  diasVacaciones: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly sesion = signal<Session | null>(null);
  readonly perfil = signal<Perfil | null>(null);

  readonly estaAutenticado = computed(() => this.sesion() !== null);
  readonly esAdmin = computed(() => this.perfil()?.rol === 'admin');
  readonly esEmpleado = computed(() => this.perfil()?.rol === 'empleado');

  // Se resuelve cuando ya se restauró la sesión guardada (por ejemplo, al recargar la página).
  // Los guards la esperan antes de decidir si dejan pasar.
  private marcarListo!: () => void;
  readonly listo = new Promise<void>(resolver => (this.marcarListo = resolver));

  constructor(private supabase: SupabaseService) {
    this.supabase.client.auth.onAuthStateChange((_evento, sesion) => {
      this.sesion.set(sesion);
      // Se difiere para no hacer consultas dentro del callback de supabase-js
      setTimeout(async () => {
        await this.cargarPerfil(sesion?.user.id ?? null);
        this.marcarListo();
      });
    });
  }

  async registrar(datos: DatosRegistro): Promise<{ requiereConfirmacion: boolean }> {
    const { data: respuesta, error } = await this.supabase.client.auth.signUp({
      email: datos.email,
      password: datos.password,
      options: {
        data: {
          first_name: datos.nombre,
          last_name: datos.apellido,
          birth_date: datos.fechaNacimiento,
          blood_type: datos.tipoSangre,
          eye_color: datos.colorOjos,
          vacation_days: datos.diasVacaciones
        }
      }
    });
    if (error) throw error;
    return { requiereConfirmacion: respuesta.session === null };
  }

  async iniciarSesion(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async cerrarSesion(): Promise<void> {
    const { error } = await this.supabase.client.auth.signOut();
    if (error) throw error;
  }

  private async cargarPerfil(id: string | null): Promise<void> {
    if (!id) {
      this.perfil.set(null);
      return;
    }

    const { data: datosPerfil, error } = await this.supabase.client
      .from('profiles')
      .select(`
        id,
        email,
        nombre:first_name,
        apellido:last_name,
        fechaNacimiento:birth_date,
        tipoSangre:blood_type,
        colorOjos:eye_color,
        diasVacaciones:vacation_days,
        rol:role
      `)
      .eq('id', id)
      .single();

    if (error) {
      console.error('Error al obtener el perfil', error);
      this.perfil.set(null);
      return;
    }
    this.perfil.set(datosPerfil as Perfil);
  }
}