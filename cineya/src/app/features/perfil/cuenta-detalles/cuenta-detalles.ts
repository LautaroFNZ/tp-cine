import { Component, inject } from '@angular/core';
import { AuthService } from '../../../core/services/auth';

@Component({
  selector: 'app-cuenta-detalles',
  templateUrl: './cuenta-detalles.html',
  styleUrl: './cuenta-detalles.scss'
})
export class CuentaDetalles {
  auth = inject(AuthService);
}