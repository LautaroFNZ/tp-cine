import { Component, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { email, form, FormField, required, submit } from '@angular/forms/signals';
import { AuthService } from '../../../core/services/auth';

interface DatosLogin {
  email: string;
  password: string;
}

@Component({
  selector: 'app-login',
  imports: [FormField, RouterLink, NgTemplateOutlet],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  modelo = signal<DatosLogin>({ email: '', password: '' });

  formulario = form(this.modelo, (ruta) => {
    required(ruta.email, { message: 'El email es obligatorio' });
    email(ruta.email, { message: 'Ingresá un email válido' });
    required(ruta.password, { message: 'La contraseña es obligatoria' });
  });

  mensajeError = signal<string | null>(null);
  enviando = signal(false);

  constructor(private auth: AuthService, private router: Router) {}

  alEnviar(evento: Event) {
    evento.preventDefault();
    this.mensajeError.set(null);

    submit(this.formulario, {
      action: async () => {
        this.enviando.set(true);
        try {
          const credenciales = this.modelo();
          await this.auth.iniciarSesion(credenciales.email, credenciales.password);
          await this.router.navigateByUrl('/');
        } catch {
          this.mensajeError.set('Email o contraseña incorrectos.');
        } finally {
          this.enviando.set(false);
        }
      }
    });
  }
}