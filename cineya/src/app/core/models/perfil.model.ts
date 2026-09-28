export type Rol = 'cliente' | 'empleado' | 'admin';

export interface Perfil {
  id: string;
  email: string;
  nombre: string | null;
  apellido: string | null;
  fechaNacimiento: string | null;
  tipoSangre: string | null;
  colorOjos: string | null;
  diasVacaciones: number | null;
  rol: Rol;
}