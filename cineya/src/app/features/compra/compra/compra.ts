import { Component, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { DatePipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { CarritoService } from '../../../core/services/carrito';
import { FuncionService } from '../../../core/services/funciones';
import { Funcion } from '../../../core/models/funcion.model';
import { ButacaService } from '../services/butacas';
import { DialogoAviso } from '../../../shared/components/dialogo-aviso/dialogo-aviso';

registerLocaleData(localeEsAr);

@Component({
  selector: 'app-compra',
  imports: [RouterLink, RouterOutlet, DatePipe, DialogoAviso],
  templateUrl: './compra.html',
  styleUrl: './compra.scss'
})
export class Compra implements OnInit, OnDestroy {
  private rutaActiva = inject(ActivatedRoute);
  private router = inject(Router);
  private funcionService = inject(FuncionService);
  private butacaService = inject(ButacaService);
  private carrito = inject(CarritoService);

  @ViewChild('avisoVencido', { static: true }) avisoVencido!: DialogoAviso;

  pasos = ['Butacas', 'Candy bar', 'Pago'];
  funcion = signal<Funcion | null>(null);
  ahora = signal(Date.now());

  private funcionId = this.rutaActiva.snapshot.paramMap.get('id') ?? '';

  // El carrito es un BehaviorSubject; toSignal lo convierte en un signal para usarlo acá
  private estado = toSignal(this.carrito.estado$, { initialValue: this.carrito.valor });

  private url = toSignal(
    this.router.events.pipe(
      filter((evento): evento is NavigationEnd => evento instanceof NavigationEnd),
      map(() => this.router.url)
    ),
    { initialValue: this.router.url }
  );

  paso = computed(() => {
    const url = this.url();
    return url.includes('/pago') ? 3 : url.includes('/candy') ? 2 : 1;
  });

  // Segundos que quedan de reserva (null = no hay reserva)
  restante = computed(() => {
    const vence = this.estado().vence;
    return vence === null ? null : Math.max(0, Math.ceil((vence - this.ahora()) / 1000));
  });

  tiempo = computed(() => {
    const segundos = this.restante();
    if (segundos === null) return '';
    const minutos = Math.floor(segundos / 60);
    return `${String(minutos).padStart(2, '0')}:${String(segundos % 60).padStart(2, '0')}`;
  });

  private reloj = setInterval(() => {
    this.ahora.set(Date.now());
    const vence = this.carrito.valor.vence;
    if (vence !== null && Date.now() >= vence) {
      this.alVencer();
    }
  }, 1000);

  async ngOnInit() {
    // Si quedó un carrito de otra función, se descarta
    const actual = this.carrito.valor.funcionId;
    if (actual && actual !== this.funcionId) {
      this.carrito.vaciar();
    }
    this.funcion.set(await this.funcionService.obtenerPorId(this.funcionId));
  }

  ngOnDestroy() {
    clearInterval(this.reloj);

    // Si se sale de la compra sin pagar, se liberan las butacas
    if (this.carrito.vigente(this.funcionId)) {
      void this.butacaService.liberar(this.funcionId);
      this.carrito.vaciar();
    }
  }

  alAceptarVencido() {
    this.router.navigate(['butacas'], { relativeTo: this.rutaActiva });
  }

  private async alVencer() {
    this.carrito.vaciar();
    this.avisoVencido.abrir();
    await this.butacaService.liberar(this.funcionId);
  }
}
