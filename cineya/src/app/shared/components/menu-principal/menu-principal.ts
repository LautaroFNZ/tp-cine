import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgClass } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../../core/services/auth';
import { AlertaService } from '../../../features/catalog/services/alertas';
import { AlertaEstreno } from '../../../core/models/alerta.model';
import { ClickAfueraDirective } from '../../directives/click-afuera';
import { estadoDeEstreno } from '../../utils/estrenos';

@Component({
  selector: 'app-menu-principal',
  imports: [NgClass, RouterLink,  ClickAfueraDirective],
  templateUrl: './menu-principal.html',
  styleUrl: './menu-principal.scss'
})
export class MenuPrincipal {
  private router = inject(Router);
  private alertaService = inject(AlertaService);
  auth = inject(AuthService);

  seccionesAbierto = signal(false);
  campanaAbierta = signal(false);
  alertas = signal<AlertaEstreno[]>([]);

  // Dirección actual, para marcar la sección en la que está el usuario
  private urlActual = toSignal(
    this.router.events.pipe(
      filter((evento): evento is NavigationEnd => evento instanceof NavigationEnd),
      map(evento => evento.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  // La cartelera y los estrenos son dos secciones de la página principal
  enPrincipal = computed(() => this.urlActual().split(/[?#]/)[0] === '/');

  // Avisos: alertas cuya venta ya abrió y que el usuario todavía no vio
  pendientes = computed(() =>
    this.alertas().filter(
      alerta => !alerta.vista && estadoDeEstreno(alerta.fechaEstreno).estado !== 'proximamente'
    )
  );

  constructor() {
    // Al iniciar o cerrar sesión se recargan (o se vacían) las alertas
    effect(() => {
      if (this.auth.estaAutenticado()) {
        untracked(() => this.cargarAlertas());
      } else {
        this.alertas.set([]);
      }
    });
  }

  alternarSecciones() {
    this.campanaAbierta.set(false);
    this.seccionesAbierto.update(abierto => !abierto);
  }

  async alternarCampana() {
    this.seccionesAbierto.set(false);
    const abrir = !this.campanaAbierta();
    this.campanaAbierta.set(abrir);
    if (abrir) await this.cargarAlertas();
  }

  cerrarMenus() {
    this.seccionesAbierto.set(false);
    this.campanaAbierta.set(false);
  }

    // Lleva hasta una sección de la página principal
  async irASeccion(seccion: 'cartelera' | 'estrenos') {
    this.cerrarMenus();

    if (this.enPrincipal()) {
      // Ya está en la página principal: solo hay que bajar hasta la sección
      document.getElementById(seccion)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // Está en otra página: vuelve a la principal, que baja sola cuando termina de cargar
      await this.router.navigate(['/'], { fragment: seccion });
    }
  }

  // Al abrir un aviso se marca como visto y el usuario va a la película
  async abrirAlerta(alerta: AlertaEstreno) {
    this.cerrarMenus();
    this.alertas.update(lista =>
      lista.map(item => (item.peliculaId === alerta.peliculaId ? { ...item, vista: true } : item))
    );
    try {
      await this.alertaService.marcarVista(alerta.peliculaId);
    } catch {
      // Si no se pudo guardar, el aviso reaparece la próxima vez: no es grave
    }
  }

  private async cargarAlertas() {
    try {
      this.alertas.set(await this.alertaService.listarMias());
    } catch {
      // Las alertas son un extra: si fallan, el menú sigue funcionando
    }
  }
}