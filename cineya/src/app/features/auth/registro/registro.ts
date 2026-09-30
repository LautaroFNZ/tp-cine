import { Component, computed, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { email, form, FormField, max, min, minLength, required, submit } from '@angular/forms/signals';
import { AuthService, DatosRegistro } from '../../../core/services/auth';
import { armarFecha } from '../../../shared/utils/fechas';

@Component({
  selector: 'app-registro',
  imports: [FormField, RouterLink, NgTemplateOutlet],
  templateUrl: './registro.html',
  styleUrl: './registro.scss'
})
export class Registro {
  tiposSangre = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  coloresOjos = ['Marrones', 'Negros', 'Verdes', 'Azules', 'Grises', 'Avellana'];

  modelo = signal<DatosRegistro>({
    nombre: '',
    apellido: '',
    email: '',
    password: '',
    fechaNacimiento: '',
    tipoSangre: '',
    colorOjos: '',
    diasVacaciones: 0
  });

  formulario = form(this.modelo, (ruta) => {
    required(ruta.nombre, { message: 'El nombre es obligatorio' });
    required(ruta.apellido, { message: 'El apellido es obligatorio' });
    required(ruta.email, { message: 'El email es obligatorio' });
    email(ruta.email, { message: 'Ingresá un email válido' });
    required(ruta.password, { message: 'La contraseña es obligatoria' });
    minLength(ruta.password, 6, { message: 'La contraseña debe tener al menos 6 caracteres' });
    required(ruta.fechaNacimiento, { message: 'La fecha de nacimiento es obligatoria' });
    required(ruta.tipoSangre, { message: 'Elegí un tipo de sangre' });
    required(ruta.colorOjos, { message: 'Elegí un color de ojos' });
    min(ruta.diasVacaciones, 0, { message: 'No puede ser negativo' });
    max(ruta.diasVacaciones, 365, { message: 'No puede superar los 365 días' });
  });

  // Las tres partes de la fecha de nacimiento
  dia = signal('');
  mes = signal('');
  anio = signal('');
  intentoEnvio = signal(false);

  // Mensaje de error de la fecha (null = sin error)
  errorFecha = computed(() => {
    const completa = this.dia() !== '' && this.mes() !== '' && this.anio().length === 4;
    if (completa) {
      const valida = armarFecha(+this.dia(), +this.mes(), +this.anio());
      return valida ? null : 'Ingresá una fecha válida (no puede ser futura).';
    }
    return this.intentoEnvio() ? 'Completá tu fecha de nacimiento (DD / MM / AAAA).' : null;
  });

  mensajeError = signal<string | null>(null);
  mensajeInfo = signal<string | null>(null);
  enviando = signal(false);

  constructor(private auth: AuthService, private router: Router) {}

  // Se ejecuta al escribir en cualquiera de las tres casillas
  escribirFecha(parte: 'dia' | 'mes' | 'anio', evento: Event, siguiente?: HTMLInputElement) {
    const campo = evento.target as HTMLInputElement;
    const valor = campo.value.replace(/\D/g, '');   // solo números
    campo.value = valor;
    this[parte].set(valor);

    const fecha = armarFecha(+this.dia(), +this.mes(), +this.anio());
    this.modelo.update(actual => ({ ...actual, fechaNacimiento: fecha }));

    // Cuando la casilla se completa, pasa a la siguiente
    if (siguiente && valor.length === campo.maxLength) {
      siguiente.focus();
    }
  }

  alEnviar(evento: Event) {
    evento.preventDefault();
    this.intentoEnvio.set(true);
    this.mensajeError.set(null);
    this.mensajeInfo.set(null);

    submit(this.formulario, {
      action: async () => {
        this.enviando.set(true);
        try {
          const resultado = await this.auth.registrar(this.modelo());
          if (resultado.requiereConfirmacion) {
            this.mensajeInfo.set('Te enviamos un mail para confirmar tu cuenta.');
          } else {
            await this.router.navigateByUrl('/');
          }
        } catch {
          this.mensajeError.set('No se pudo completar el registro. Revisá los datos o probá con otro email.');
        } finally {
          this.enviando.set(false);
        }
      }
    });
  }
}