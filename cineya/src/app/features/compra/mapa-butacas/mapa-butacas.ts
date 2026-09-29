import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DatePipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { FuncionService } from '../../../core/services/funciones';
import { PrecioService } from '../../../core/services/precios';
import { ButacaService } from '../services/butacas';
import { Funcion } from '../../../core/models/funcion.model';
import { Butaca, TipoButaca } from '../../../core/models/butaca.model';
import { PreciosFuncion } from '../../../core/models/precios.model';
import { calcularEdad } from '../../../shared/utils/fechas';

registerLocaleData(localeEsAr);

type EstadoButaca = 'libre' | 'ocupada' | 'seleccionada';
type EstadoEdad = 'ok' | 'sin_sesion' | 'no_cumple';

interface FilaMapa {
  etiqueta: string;
  tipo: TipoButaca;
  bloques: Butaca[][];
}

@Component({
  selector: 'app-mapa-butacas',
  imports: [RouterLink, DatePipe, CurrencyPipe],
  templateUrl: './mapa-butacas.html',
  styleUrl: './mapa-butacas.scss'
})
export class MapaButacas implements OnInit, OnDestroy {
  private rutaActiva = inject(ActivatedRoute);
  private funcionService = inject(FuncionService);
  private precioService = inject(PrecioService);
  private butacaService = inject(ButacaService);
  auth = inject(AuthService);

  funcion = signal<Funcion | null>(null);
  butacas = signal<Butaca[]>([]);
  precios = signal<PreciosFuncion | null>(null);
  ocupadas = signal<ReadonlySet<string>>(new Set());
  seleccion = signal<string[]>([]);

  cargando = signal(true);
  noEncontrada = signal(false);
  confirmando = signal(false);
  compraConfirmada = signal(false);
  montoConfirmado = signal<number | null>(null);
  aviso = signal<string | null>(null);

  private cancelarSuscripcion: (() => void) | null = null;

  // Agrupa las butacas por fila y por bloque (izquierda, centro, derecha)
  filas = computed<FilaMapa[]>(() => {
    const porFila = new Map<string, FilaMapa>();
    for (const butaca of this.butacas()) {
      let fila = porFila.get(butaca.fila);
      if (!fila) {
        fila = { etiqueta: butaca.fila, tipo: butaca.tipo, bloques: [[], [], []] };
        porFila.set(butaca.fila, fila);
      }
      fila.bloques[butaca.bloque - 1].push(butaca);
    }
    return [...porFila.values()];
  });

  seleccionadas = computed(() => {
    const ids = this.seleccion();
    return this.butacas().filter(butaca => ids.includes(butaca.id));
  });

  hayVip = computed(() => this.seleccionadas().some(butaca => butaca.tipo === 'vip'));

  total = computed(() => {
    const precios = this.precios();
    if (!precios) return null;
    return this.seleccionadas().reduce((suma, butaca) => suma + this.precioDe(butaca, precios), 0);
  });

  // 0 = película sin restricción de edad
  edadMinima = computed(() => {
    const clasificacion = this.funcion()?.clasificacionEdad;
    return clasificacion && clasificacion !== 'none' ? Number(clasificacion) : 0;
  });

  estadoEdad = computed<EstadoEdad>(() => {
    if (this.edadMinima() === 0) return 'ok';
    if (!this.auth.estaAutenticado()) return 'sin_sesion';

    const nacimiento = this.auth.perfil()?.fechaNacimiento;
    if (!nacimiento) return 'no_cumple';
    return calcularEdad(nacimiento) >= this.edadMinima() ? 'ok' : 'no_cumple';
  });

  async ngOnInit() {
    const id = this.rutaActiva.snapshot.paramMap.get('id');
    if (!id) {
      this.noEncontrada.set(true);
      this.cargando.set(false);
      return;
    }

    const funcion = await this.funcionService.obtenerPorId(id);
    if (!funcion) {
      this.noEncontrada.set(true);
      this.cargando.set(false);
      return;
    }
    this.funcion.set(funcion);

    try {
      this.butacas.set(await this.butacaService.obtenerPorSala(funcion.salaId));
    } catch {
      this.aviso.set('No se pudo cargar el mapa de butacas.');
    }

    this.precios.set(await this.precioService.obtenerPreciosFuncion(id));

    this.cancelarSuscripcion = this.butacaService.suscribirseAOcupacion(
      id,
      butacaId => this.marcarOcupada(butacaId),
      butacaId => this.marcarLiberada(butacaId),
      () => this.cargarOcupadas()
    );

    // Espera a que se restaure la sesión, para no mostrar un aviso de edad equivocado
    await this.auth.listo;
    this.cargando.set(false);
  }

  ngOnDestroy() {
    this.cancelarSuscripcion?.();
  }

  precioDe(butaca: Butaca, precios: PreciosFuncion): number {
    return precios.precioBase + (butaca.tipo === 'vip' ? precios.recargoVip : 0);
  }

  estado(butaca: Butaca): EstadoButaca {
    if (this.ocupadas().has(butaca.id)) return 'ocupada';
    if (this.seleccion().includes(butaca.id)) return 'seleccionada';
    return 'libre';
  }

  descripcion(butaca: Butaca): string {
    const tipo = butaca.tipo === 'vip' ? ' (VIP)' : butaca.tipo === 'accessible' ? ' (accesible)' : '';
    const ocupada = this.ocupadas().has(butaca.id) ? ', ocupada' : '';
    return `Fila ${butaca.fila}, butaca ${butaca.numero}${tipo}${ocupada}`;
  }

  alternar(butaca: Butaca) {
    if (this.ocupadas().has(butaca.id)) return;

    this.aviso.set(null);
    this.compraConfirmada.set(false);
    this.montoConfirmado.set(null);
    this.seleccion.update(actual =>
      actual.includes(butaca.id) ? actual.filter(id => id !== butaca.id) : [...actual, butaca.id]
    );
  }

  async confirmar() {
    const funcionId = this.funcion()?.id;
    if (!funcionId || this.seleccion().length === 0 || this.estadoEdad() !== 'ok') return;

    const monto = this.total();
    this.confirmando.set(true);
    this.aviso.set(null);
    try {
      await this.butacaService.confirmar(funcionId, this.seleccion());
      this.seleccion.set([]);
      this.montoConfirmado.set(monto);
      this.compraConfirmada.set(true);
    } catch (error: any) {
      if (error?.message === 'BUTACA_OCUPADA') {
        await this.cargarOcupadas();
        this.aviso.set('Alguna butaca se ocupó justo antes de confirmar. Revisá tu selección.');
      } else if (error?.message === 'EDAD_NO_PERMITIDA') {
        this.aviso.set('No cumplís la edad mínima para esta película.');
      } else if (error?.message === 'SESION_REQUERIDA') {
        this.aviso.set('Iniciá sesión para comprar entradas de esta película.');
      } else {
        this.aviso.set('No se pudo confirmar la selección. Probá de nuevo.');
      }
    } finally {
      this.confirmando.set(false);
    }
  }

  // Trae la ocupación completa. Se ejecuta al conectarse (y al reconectarse) para no perder cambios.
  private async cargarOcupadas() {
    const funcionId = this.funcion()?.id;
    if (!funcionId) return;

    try {
      const ids = await this.butacaService.obtenerOcupadas(funcionId);
      this.ocupadas.set(new Set(ids));
      this.seleccion.update(actual => actual.filter(id => !this.ocupadas().has(id)));
    } catch {
      this.aviso.set('No se pudo actualizar la ocupación de butacas.');
    }
  }

  private marcarOcupada(butacaId: string) {
    this.ocupadas.update(actuales => new Set(actuales).add(butacaId));

    // Mientras confirmo, los eventos que llegan son de mi propia compra
    if (!this.confirmando() && this.seleccion().includes(butacaId)) {
      const butaca = this.butacas().find(b => b.id === butacaId);
      this.seleccion.update(actual => actual.filter(id => id !== butacaId));
      this.aviso.set(
        butaca
          ? `La butaca ${butaca.fila}${butaca.numero} fue ocupada por otra compra. Elegí otra.`
          : 'Una de tus butacas fue ocupada por otra compra. Elegí otra.'
      );
    }
  }

  private marcarLiberada(butacaId: string) {
    this.ocupadas.update(actuales => {
      const nuevas = new Set(actuales);
      nuevas.delete(butacaId);
      return nuevas;
    });
  }
}