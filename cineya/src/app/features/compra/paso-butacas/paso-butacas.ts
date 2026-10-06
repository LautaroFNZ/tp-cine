import { Component, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { CarritoService } from '../../../core/services/carrito';
import { FuncionService } from '../../../core/services/funciones';
import { PrecioService } from '../../../core/services/precios';
import { ButacaService } from '../services/butacas';
import { Funcion } from '../../../core/models/funcion.model';
import { Butaca, TipoButaca } from '../../../core/models/butaca.model';
import { PreciosFuncion } from '../../../core/models/precios.model';
import { calcularEdad } from '../../../shared/utils/fechas';
import { DialogoAviso } from '../../../shared/components/dialogo-aviso/dialogo-aviso';

registerLocaleData(localeEsAr);

type EstadoButaca = 'libre' | 'ocupada' | 'reservada' | 'seleccionada';
type EstadoEdad = 'ok' | 'sin_sesion' | 'no_cumple';

interface FilaMapa {
  etiqueta: string;
  tipo: TipoButaca;
  bloques: Butaca[][];
}

@Component({
  selector: 'app-paso-butacas',
  imports: [RouterLink, CurrencyPipe, DialogoAviso],
  templateUrl: './paso-butacas.html',
  styleUrl: './paso-butacas.scss'
})
export class PasoButacas implements OnInit, OnDestroy {
  private rutaActiva = inject(ActivatedRoute);
  private router = inject(Router);
  private funcionService = inject(FuncionService);
  private precioService = inject(PrecioService);
  private butacaService = inject(ButacaService);
  private carrito = inject(CarritoService);
  auth = inject(AuthService);

  @ViewChild('avisoTiempo', { static: true }) avisoTiempo!: DialogoAviso;

  funcion = signal<Funcion | null>(null);
  butacas = signal<Butaca[]>([]);
  precios = signal<PreciosFuncion | null>(null);
  ocupadas = signal<ReadonlySet<string>>(new Set());
  reservadas = signal<ReadonlyMap<string, number>>(new Map());   // butaca -> vencimiento (ms)
  seleccion = signal<string[]>([]);
  ahora = signal(Date.now());

  cargando = signal(true);
  noEncontrada = signal(false);
  confirmando = signal(false);
  aviso = signal<string | null>(null);
    info = signal<string | null>(null);
  private cantidadPrevia = 0;

  private funcionId = this.rutaActiva.parent?.snapshot.paramMap.get('id') ?? '';
  private estadoCarrito = toSignal(this.carrito.estado$, { initialValue: this.carrito.valor });
  private misButacas = computed(() => new Set(this.estadoCarrito().butacas.map(b => b.id)));
  private cancelarSuscripcion: (() => void) | null = null;

  // Cada segundo se actualiza la hora para que las reservas vencidas dejen de verse bloqueadas
  private reloj = setInterval(() => this.ahora.set(Date.now()), 1000);

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
    return this.seleccionadas().reduce((suma, butaca) => suma + this.carrito.precioDe(butaca, precios), 0);
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
    const funcion = await this.funcionService.obtenerPorId(this.funcionId);
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

    this.precios.set(await this.precioService.obtenerPreciosFuncion(this.funcionId));

        if (this.carrito.vigente(this.funcionId)) {
      // Todavía tiene la reserva vigente: recupera su selección
      this.seleccion.set(this.carrito.valor.butacas.map(butaca => butaca.id));
    } else {
      // Si aceptó soltar sus butacas, vuelven a marcarse (sin reservar) para confirmarlas de nuevo
      const previa = this.carrito.recuperarSeleccionPrevia(this.funcionId);
      this.seleccion.set(previa);
      this.cantidadPrevia = previa.length;
      if (previa.length > 0) {
        this.info.set('Liberamos tus butacas. Confirmalas de nuevo para reservarlas otra vez.');
      }
    }

    this.cancelarSuscripcion = this.butacaService.suscribirse(this.funcionId, {
      alOcuparse: id => this.marcarOcupada(id),
      alLiberarse: id => this.marcarLiberada(id),
      alReservarse: (id, vence) => this.marcarReserva(id, vence),
      alLiberarseReserva: id => this.quitarReserva(id),
      alConectar: () => this.cargarEstado()
    });

    await this.auth.listo;
    this.cargando.set(false);
  }

  ngOnDestroy() {
    clearInterval(this.reloj);
    this.cancelarSuscripcion?.();
  }

  estado(butaca: Butaca): EstadoButaca {
    if (this.ocupadas().has(butaca.id)) return 'ocupada';
    if (this.seleccion().includes(butaca.id)) return 'seleccionada';
    if (this.reservadaPorOtro(butaca.id, this.ahora())) return 'reservada';
    return 'libre';
  }

  descripcion(butaca: Butaca): string {
    const tipo = butaca.tipo === 'vip' ? ' (VIP)' : butaca.tipo === 'accessible' ? ' (accesible)' : '';
    const estado = this.estado(butaca);
    const detalle = estado === 'ocupada' ? ', ocupada' : estado === 'reservada' ? ', reservada por otra persona' : '';
    return `Fila ${butaca.fila}, butaca ${butaca.numero}${tipo}${detalle}`;
  }

  carrito_precio(butaca: Butaca, precios: PreciosFuncion): number {
    return this.carrito.precioDe(butaca, precios);
  }

  alternar(butaca: Butaca) {
    const estado = this.estado(butaca);
    if (estado === 'ocupada' || estado === 'reservada') return;

    this.aviso.set(null);
    this.info.set(null);
    this.seleccion.update(actual =>
      actual.includes(butaca.id) ? actual.filter(id => id !== butaca.id) : [...actual, butaca.id]
    );
  }

  async confirmar() {
    const funcion = this.funcion();
    if (!funcion || this.seleccion().length === 0 || this.estadoEdad() !== 'ok') return;

    this.confirmando.set(true);
    this.aviso.set(null);
    this.info.set(null);
    try {
      const segundos = await this.butacaService.reservar(funcion.id, this.seleccion());
      this.carrito.iniciar(funcion.id, this.seleccionadas(), this.precios(), segundos);
      this.avisoTiempo.abrir();   // el usuario tiene que aceptar el aviso para continuar
    } catch (error: any) {
      if (error?.message === 'BUTACA_OCUPADA') {
        await this.cargarEstado();
        this.aviso.set('Alguna butaca ya no está disponible. Revisá tu selección.');
      } else if (error?.message === 'EDAD_NO_PERMITIDA') {
        this.aviso.set('No cumplís la edad mínima para esta película.');
      } else if (error?.message === 'SESION_REQUERIDA') {
        this.aviso.set('Iniciá sesión para comprar entradas de esta película.');
      } else if (error?.message === 'VENTA_NO_ABIERTA') {
        this.aviso.set('La venta de entradas de esta película todavía no abrió.');  
      } else {
        this.aviso.set('No se pudieron reservar las butacas. Probá de nuevo.');
      }
    } finally {
      this.confirmando.set(false);
    }
  }

  // Se ejecuta cuando el usuario acepta el aviso de los 5 minutos
  continuar() {
    this.router.navigate(['../candy'], { relativeTo: this.rutaActiva });
  }

  private reservadaPorOtro(id: string, ahora: number): boolean {
    const vence = this.reservadas().get(id);
    return vence !== undefined && vence > ahora && !this.misButacas().has(id);
  }

  // Trae ocupación y reservas completas. Se ejecuta al conectarse (y reconectarse).
  private async cargarEstado() {
    try {
      const [ids, reservas] = await Promise.all([
        this.butacaService.obtenerOcupadas(this.funcionId),
        this.butacaService.obtenerReservas(this.funcionId)
      ]);
      this.ocupadas.set(new Set(ids));
      this.reservadas.set(new Map(reservas.map(r => [r.butacaId, r.vence] as [string, number])));
      this.seleccion.update(actual =>
        actual.filter(id => !this.ocupadas().has(id) && !this.reservadaPorOtro(id, Date.now()))
      );

      // Si al volver alguna de las butacas soltadas ya no está disponible, se avisa
      if (this.cantidadPrevia > 0) {
        if (this.seleccion().length < this.cantidadPrevia) {
          this.aviso.set('Algunas butacas que habías elegido ya no están disponibles. Revisá tu selección.');
        }
        this.cantidadPrevia = 0;
      }
    } catch {
      this.aviso.set('No se pudo actualizar la disponibilidad de butacas.');
    }
  }

  private marcarOcupada(butacaId: string) {
    this.ocupadas.update(actuales => new Set(actuales).add(butacaId));

    if (!this.confirmando() && this.seleccion().includes(butacaId)) {
      this.seleccion.update(actual => actual.filter(id => id !== butacaId));
      this.aviso.set('Una de tus butacas fue ocupada por otra compra. Elegí otra.');
    }
  }

  private marcarLiberada(butacaId: string) {
    this.ocupadas.update(actuales => {
      const nuevas = new Set(actuales);
      nuevas.delete(butacaId);
      return nuevas;
    });
  }

  private marcarReserva(butacaId: string, vence: number) {
    this.reservadas.update(actuales => new Map(actuales).set(butacaId, vence));

    // Mientras confirmo, los eventos que llegan son de mi propia reserva
    if (!this.confirmando() && this.seleccion().includes(butacaId) && !this.misButacas().has(butacaId)) {
      this.seleccion.update(actual => actual.filter(id => id !== butacaId));
      this.aviso.set('Otra persona reservó una de tus butacas. Elegí otra.');
    }
  }

  private quitarReserva(butacaId: string) {
    this.reservadas.update(actuales => {
      const nuevas = new Map(actuales);
      nuevas.delete(butacaId);
      return nuevas;
    });
  }
}