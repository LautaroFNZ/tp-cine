import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, NgClass, NgTemplateOutlet, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { AlertaService } from '../services/alertas';
import { Pelicula } from '../../../core/models/pelicula.model';
import { EdadMinimaPipe } from '../../../shared/pipes/edad-minima-pipe';
import { FiltrarPeliculasPipe } from '../../../shared/pipes/filtrar-peliculas-pipe';
import { InfoEstreno, estadoDeEstreno } from '../../../shared/utils/estrenos';

registerLocaleData(localeEsAr);

interface ItemEstreno extends InfoEstreno {
  pelicula: Pelicula;
}

@Component({
  selector: 'app-seccion-estrenos',
  imports: [CurrencyPipe, DatePipe, NgClass, NgTemplateOutlet, RouterLink, EdadMinimaPipe],
  templateUrl: './seccion-estrenos.html',
  styleUrl: './seccion-estrenos.scss'
})
export class SeccionEstrenos implements OnInit {
  private alertaService = inject(AlertaService);
  auth = inject(AuthService);

  // Datos que bajan desde la cartelera (el componente padre): los estrenos y lo que
  // el usuario escribió en el buscador o eligió en el filtro de géneros
  peliculas = input.required<Pelicula[]>();
  texto = input('');
  generoId = input<number | null>(null);

  // Es el mismo filtro que usa la cartelera, así la búsqueda vale para las dos secciones
  private filtro = new FiltrarPeliculasPipe();

  idsConAlerta = signal<Set<string>>(new Set());
  mensajeError = signal<string | null>(null);
  trabajando = signal<string | null>(null);   // id de la película cuya alerta se está cambiando

  // Los estrenos que coinciden con la búsqueda, del más cercano al más lejano
  estrenos = computed<ItemEstreno[]>(() =>
    this.filtro
      .transform(this.peliculas(), this.texto(), this.generoId())
      .map(pelicula => ({ pelicula, ...estadoDeEstreno(pelicula.fechaEstreno) }))
      .sort((a, b) => a.estreno.getTime() - b.estreno.getTime())
  );

  // La venta ya abrió (faltan 7 días o menos) y todavía no abrió
  enPreventa = computed(() => this.estrenos().filter(item => item.estado === 'preventa'));
  proximos = computed(() => this.estrenos().filter(item => item.estado === 'proximamente'));

  async ngOnInit() {
    // Las alertas son solo para usuarios registrados
    await this.auth.listo;
    if (this.auth.estaAutenticado()) {
      try {
        const alertas = await this.alertaService.listarMias();
        this.idsConAlerta.set(new Set(alertas.map(alerta => alerta.peliculaId)));
      } catch {
        // Si no se pueden cargar, los botones quedan como "sin alerta"
      }
    }
  }

  tieneAlerta(peliculaId: string): boolean {
    return this.idsConAlerta().has(peliculaId);
  }

  // ¿Tiene precio de preventa cargado y todavía vigente?
  hayPrecioPreventa(pelicula: Pelicula): boolean {
    return (
      pelicula.precioPreventa !== null &&
      !!pelicula.finPreventa &&
      Date.parse(pelicula.finPreventa) > Date.now()
    );
  }

  async alternarAlerta(peliculaId: string) {
    this.mensajeError.set(null);
    this.trabajando.set(peliculaId);
    const activar = !this.tieneAlerta(peliculaId);
    try {
      if (activar) {
        await this.alertaService.activar(peliculaId);
      } else {
        await this.alertaService.desactivar(peliculaId);
      }
      this.idsConAlerta.update(ids => {
        const nuevos = new Set(ids);
        if (activar) nuevos.add(peliculaId);
        else nuevos.delete(peliculaId);
        return nuevos;
      });
    } catch {
      this.mensajeError.set('No se pudo cambiar la alerta. Probá de nuevo.');
    } finally {
      this.trabajando.set(null);
    }
  }
}