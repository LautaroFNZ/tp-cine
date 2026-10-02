import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  auth = inject(AuthService);
  private router = inject(Router);

  menuAbierto = signal(false);

  // Primera letra del nombre + primera del apellido; si faltan, la inicial del email
  iniciales = computed(() => {
    const perfil = this.auth.perfil();
    const primera = perfil?.nombre?.trim().charAt(0) ?? '';
    const segunda = perfil?.apellido?.trim().charAt(0) ?? '';
    const resultado = (primera + segunda).toUpperCase();
    return resultado || (perfil?.email.charAt(0).toUpperCase() ?? '?');
  });

  alternarMenu() {
    this.menuAbierto.update(abierto => !abierto);
  }

  cerrarMenu() {
    this.menuAbierto.set(false);
  }

  async irACuenta() {
    this.cerrarMenu();
    await this.router.navigateByUrl('/cuenta/detalles');
  }

  async irAMisCompras() {
    this.cerrarMenu();
    await this.router.navigateByUrl('/cuenta/compras');
  }

  async cerrarSesion() {
    this.cerrarMenu();
    await this.auth.cerrarSesion();
    await this.router.navigateByUrl('/');
  }
}