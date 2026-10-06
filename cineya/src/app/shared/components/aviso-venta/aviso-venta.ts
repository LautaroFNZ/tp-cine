import { Component, Input } from '@angular/core';
import { DatePipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { RouterLink } from '@angular/router';
import { InfoEstreno, estadoDeEstreno } from '../../utils/estrenos';

registerLocaleData(localeEsAr);

// Aviso que se muestra en el detalle de una película que todavía no se estrenó
@Component({
  selector: 'app-aviso-venta',
  imports: [DatePipe, RouterLink],
  templateUrl: './aviso-venta.html',
  styleUrl: './aviso-venta.scss'
})
export class AvisoVenta {
  // Dato que baja desde el componente padre (la fecha de estreno de la película)
  @Input({ required: true }) fechaEstreno!: string;

  get info(): InfoEstreno {
    return estadoDeEstreno(this.fechaEstreno);
  }
}