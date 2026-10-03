import { Component, OnInit, ViewChild, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { DescuentoService } from '../../compra/services/descuentos';
import { DialogoAviso } from '../../../shared/components/dialogo-aviso/dialogo-aviso';

const CLAVE_VISTO = 'cineya_cartel_cupon_visto';
// Pantallas donde el cartel molestaría: el usuario ya está ingresando o viendo su entrada
const RUTAS_SIN_CARTEL = ['/login', '/registro', '/entrada'];

@Component({
  selector: 'app-cartel-cupon',
  imports: [DialogoAviso],
  templateUrl: './cartel-cupon.html'
})
export class CartelCupon implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);
  private descuentoService = inject(DescuentoService);

  @ViewChild('cartel', { static: true }) private cartel!: DialogoAviso;

  porcentaje = signal(0);

  async ngOnInit() {
    if (this.yaVisto()) return;

    // Hay que esperar a que se restaure la sesión: si no, también lo vería quien ya inició sesión
    await this.auth.listo;
    if (this.auth.estaAutenticado()) return;
    if (RUTAS_SIN_CARTEL.some(ruta => window.location.pathname.startsWith(ruta))) return;

    try {
      const porcentaje = await this.descuentoService.obtenerPorcentajeBienvenida();
      if (porcentaje > 0) {
        this.porcentaje.set(porcentaje);
        this.cartel.abrir();
      }
    } catch {
      // Si no se puede consultar el porcentaje, no se muestra el cartel
    }
  }

  irARegistro() {
    this.marcarVisto();
    this.router.navigateByUrl('/registro');
  }

  cerrar() {
    this.marcarVisto();
  }

  // Se recuerda mientras dure la pestaña, para que no reaparezca en cada recarga
  private yaVisto(): boolean {
    try {
      return sessionStorage.getItem(CLAVE_VISTO) === '1';
    } catch {
      return false;
    }
  }

  private marcarVisto() {
    try {
      sessionStorage.setItem(CLAVE_VISTO, '1');
    } catch {
      // Si el navegador no permite guardarlo, el cartel puede volver a aparecer
    }
  }
}