import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EntradaService } from '../services/entradas';
import { Compra } from '../../../core/models/compra.model';
import { descargarPdfEntrada } from '../../../shared/utils/pdf-entrada';

registerLocaleData(localeEsAr);

@Component({
  selector: 'app-entrada',
  imports: [CurrencyPipe, DatePipe, RouterLink],
  templateUrl: './entrada.html',
  styleUrl: './entrada.scss'
})
export class Entrada implements OnInit {
  private rutaActiva = inject(ActivatedRoute);
  private entradaService = inject(EntradaService);

  compra = signal<Compra | null>(null);
  qr = signal<string | null>(null);
  cargando = signal(true);
  noEncontrada = signal(false);
  descargando = signal(false);
  mensajeError = signal<string | null>(null);

  // 0 = película sin restricción de edad
  edadMinima = computed(() => {
    const clasificacion = this.compra()?.clasificacionEdad;
    return clasificacion && clasificacion !== 'none' ? Number(clasificacion) : 0;
  });

  // El código se muestra en dos grupos para leerlo mejor
  codigoFormateado = computed(() => {
    const codigo = this.compra()?.codigo ?? '';
    return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
  });

  async ngOnInit() {
    const codigo = this.rutaActiva.snapshot.paramMap.get('codigo') ?? '';
    try {
      const compra = await this.entradaService.obtenerPorCodigo(codigo);
      if (!compra) {
        this.noEncontrada.set(true);
        return;
      }
      this.compra.set(compra);
      this.qr.set(await this.entradaService.generarQr(compra.codigo));
    } catch {
      this.mensajeError.set('No se pudo cargar la entrada. Probá de nuevo en unos minutos.');
    } finally {
      this.cargando.set(false);
    }
  }

  async descargar() {
    const compra = this.compra();
    const qr = this.qr();
    if (!compra || !qr) return;

    this.descargando.set(true);
    this.mensajeError.set(null);
    try {
      await descargarPdfEntrada(compra, qr);
    } catch {
      this.mensajeError.set('No se pudo generar el PDF. Probá de nuevo.');
    } finally {
      this.descargando.set(false);
    }
  }
}