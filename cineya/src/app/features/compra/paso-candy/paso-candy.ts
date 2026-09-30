import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ResumenCompra } from '../resumen-compra/resumen-compra';

@Component({
  selector: 'app-paso-candy',
  imports: [ResumenCompra],
  templateUrl: './paso-candy.html',
  styleUrl: './paso-candy.scss'
})
export class PasoCandy {
  private router = inject(Router);
  private rutaActiva = inject(ActivatedRoute);

  volver() {
    this.router.navigate(['../butacas'], { relativeTo: this.rutaActiva });
  }

  continuar() {
    this.router.navigate(['../pago'], { relativeTo: this.rutaActiva });
  }
}
