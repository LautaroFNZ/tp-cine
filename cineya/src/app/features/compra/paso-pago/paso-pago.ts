import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, DecimalPipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { CarritoService } from '../../../core/services/carrito';
import { CreditoService } from '../../../core/services/credito';
import { PuntosService } from '../../../core/services/puntos';
import { Recompensa } from '../../../core/models/recompensa.model';
import { ButacaService } from '../services/butacas';
import { DescuentoService } from '../services/descuentos';
import { ResumenCompra } from '../resumen-compra/resumen-compra';

registerLocaleData(localeEsAr);

type MetodoPago = 'card' | 'wallet';

@Component({
  selector: 'app-paso-pago',
  imports: [ResumenCompra, RouterLink, CurrencyPipe, DecimalPipe],
  templateUrl: './paso-pago.html',
  styleUrl: './paso-pago.scss'
})
export class PasoPago implements OnInit {
  private router = inject(Router);
  private rutaActiva = inject(ActivatedRoute);
  private carrito = inject(CarritoService);
  private butacaService = inject(ButacaService);
  private descuentoService = inject(DescuentoService);
  private puntosService = inject(PuntosService);
  private creditoService = inject(CreditoService);
  auth = inject(AuthService);

  metodos: { valor: MetodoPago; texto: string }[] = [
    { valor: 'card', texto: 'Tarjeta de crédito o débito' },
    { valor: 'wallet', texto: 'Billetera virtual' }
  ];
  metodo = signal<MetodoPago>('card');

  pagando = signal(false);
  codigo = signal<string | null>(null);
  totalCompra = signal(0);
  pagadoConCredito = signal(0);
  puntosGanados = signal(0);
  mensajeError = signal<string | null>(null);

  // Cupón: lo que escribe el usuario y el código que la base ya comprobó
  cupon = signal('');
  cuponValidado = signal<string | null>(null);
  aplicandoCupon = signal(false);
  mensajeCupon = signal<string | null>(null);
  errorCupon = signal<string | null>(null);

  // Puntos: saldo del usuario y recompensas que puede canjear
  saldo = signal(0);
  recompensas = signal<Recompensa[]>([]);

  // El carrito es un BehaviorSubject; toSignal lo convierte en un signal para usarlo acá
  private estado = toSignal(this.carrito.estado$, { initialValue: this.carrito.valor });

  puntosUsados = computed(() => this.carrito.puntosCanjeados(this.estado()));
  puntosDisponibles = computed(() => this.saldo() - this.puntosUsados());

  // Entradas (butacas) que todavía no se canjearon con puntos
  entradasSinCanjear = computed(() => {
    const estado = this.estado();
    return estado.butacas.length - this.carrito.entradasCanjeadas(estado);
  });

  // 1 punto por cada peso que se paga
  puntosAGanar = computed(() => Math.max(0, Math.floor(this.carrito.total(this.estado()))));

  // Crédito de la cuenta: saldo, cuánto se aplica a esta compra y cuánto queda por pagar
  saldoCredito = computed(() => this.estado().credito.saldo);
  usaCredito = computed(() => this.estado().credito.usar);
  creditoAplicado = computed(() => this.carrito.creditoAplicado(this.estado()));
  aPagar = computed(() => this.carrito.aPagar(this.estado()));

  // El código se muestra en dos grupos para leerlo mejor
  codigoFormateado = computed(() => {
    const codigo = this.codigo();
    return codigo ? `${codigo.slice(0, 5)}-${codigo.slice(5)}` : '';
  });

  async ngOnInit() {
    // Calcula el descuento de bienvenida (si corresponde) para mostrarlo antes de pagar
    try {
      await this.recalcularDescuento('');
    } catch {
      // Si falla, la base igual aplica el descuento que corresponda al pagar
    }

    // Puntos y crédito: solo para usuarios registrados
    await this.auth.listo;
    if (this.auth.estaAutenticado()) {
      try {
        const [saldo, recompensas] = await Promise.all([
          this.puntosService.obtenerSaldo(),
          this.puntosService.listarRecompensas()
        ]);
        this.saldo.set(saldo);
        this.recompensas.set(recompensas);
      } catch {
        // Si no se pueden cargar, el pago sigue funcionando sin canjes
      }

      try {
        this.carrito.establecerSaldoCredito(await this.creditoService.obtenerSaldo());
      } catch {
        // Si no se puede cargar, el pago sigue funcionando sin crédito
      }
    }
  }

  volver() {
    this.router.navigate(['../candy'], { relativeTo: this.rutaActiva });
  }

  alternarCredito(usar: boolean) {
    this.carrito.usarCredito(usar);
  }

  cantidadCanje(recompensaId: string): number {
    return this.carrito.cantidadDeCanje(recompensaId);
  }

  // Alcanzan los puntos y, si es una entrada, queda alguna butaca sin canjear
  puedeCanjear(recompensa: Recompensa): boolean {
    if (recompensa.puntos > this.puntosDisponibles()) return false;
    return recompensa.tipo !== 'entrada' || this.entradasSinCanjear() > 0;
  }

  async canjear(recompensa: Recompensa) {
    if (!this.puedeCanjear(recompensa)) return;
    this.carrito.agregarCanje(recompensa);
    await this.actualizarDescuento();
  }

  async quitarCanje(recompensa: Recompensa) {
    this.carrito.quitarCanje(recompensa.id);
    await this.actualizarDescuento();
  }

  async aplicarCupon() {
    const codigo = this.cupon().trim().toUpperCase();
    this.mensajeCupon.set(null);
    this.errorCupon.set(null);
    if (!codigo) return;

    this.aplicandoCupon.set(true);
    try {
      const vista = await this.recalcularDescuento(codigo);
      this.cuponValidado.set(codigo);
      this.mensajeCupon.set(
        vista.cuponAplicado
          ? `Cupón ${codigo} aplicado.`
          : 'Tu descuento de bienvenida es más conveniente que este cupón, así que se mantiene ese.'
      );
    } catch (error: any) {
      this.errorCupon.set(this.textoErrorCupon(error?.message));
    } finally {
      this.aplicandoCupon.set(false);
    }
  }

  async quitarCupon() {
    this.cupon.set('');
    this.cuponValidado.set(null);
    this.mensajeCupon.set(null);
    this.errorCupon.set(null);
    await this.actualizarDescuento();
  }

  async pagar() {
    const estado = this.carrito.valor;
    if (!estado.funcionId || estado.butacas.length === 0) return;

    this.pagando.set(true);
    this.mensajeError.set(null);
    try {
      // Pago simulado: una espera corta para que se note el procesamiento
      await new Promise(resolver => setTimeout(resolver, 1500));

      const total = this.carrito.total(estado);
      const conCredito = this.carrito.creditoAplicado(estado);
      const resultado = await this.butacaService.comprar(
        estado.funcionId,
        estado.butacas.map(butaca => butaca.id),
        estado.items.map(item => ({ productoId: item.producto.id, cantidad: item.cantidad })),
        this.metodo(),
        this.cuponValidado(),
        estado.canjes.map(item => ({ recompensaId: item.recompensa.id, cantidad: item.cantidad })),
        estado.credito.usar
      );

      this.totalCompra.set(total);
      this.pagadoConCredito.set(conCredito);
      this.puntosGanados.set(this.auth.estaAutenticado() ? Math.max(0, Math.floor(total)) : 0);
      this.codigo.set(resultado.codigo);
      this.carrito.vaciar();
      this.carrito.establecerCompraRealizada(true);
    } catch (error: any) {
      const mensaje: string = error?.message ?? '';
      const mensajes: Record<string, string> = {
        RESERVA_VENCIDA: 'Tu reserva venció. Volvé al mapa para elegir las butacas de nuevo.',
        PRODUCTO_NO_DISPONIBLE: 'Alguno de los productos ya no está disponible. Volvé al candy bar y revisá tu elección.',
        PUNTOS_INSUFICIENTES: 'No te alcanzan los puntos para los canjes elegidos.',
        CANJE_NO_DISPONIBLE: 'Alguna de las recompensas ya no está disponible. Revisá tus canjes.',
        CANJE_EXCEDE: 'Elegiste más entradas gratis que butacas.',
        CANJE_SESION: 'Iniciá sesión para canjear puntos.'
      };
      if (mensaje.startsWith('CUPON_')) {
        this.mensajeError.set(this.textoErrorCupon(mensaje));
      } else {
        this.mensajeError.set(mensajes[mensaje] ?? 'No se pudo completar la compra. Probá de nuevo.');
      }
    } finally {
      this.pagando.set(false);
    }
  }

  // Vuelve a calcular el descuento con el cupón que ya estaba aplicado (si había uno)
  private async actualizarDescuento() {
    try {
      await this.recalcularDescuento(this.cuponValidado() ?? '');
    } catch {
      // Se conserva lo que había
    }
  }

  // Le pide a la base el descuento para el subtotal actual y lo guarda en el carrito
  private async recalcularDescuento(cupon: string) {
    const subtotal = this.carrito.subtotal(this.carrito.valor);
    const vista = await this.descuentoService.calcular(cupon, subtotal);
    this.carrito.establecerDescuento(
      vista.porcentaje > 0 && vista.etiqueta
        ? { etiqueta: vista.etiqueta, porcentaje: vista.porcentaje, monto: vista.monto }
        : null
    );
    return vista;
  }

  private textoErrorCupon(codigo: string | undefined): string {
    const mensajes: Record<string, string> = {
      CUPON_INVALIDO: 'El cupón no existe o ya no está disponible.',
      CUPON_SESION: 'Iniciá sesión para usar un cupón.',
      CUPON_EDAD: 'Este cupón no está disponible para tu edad.',
      CUPON_USADO: 'Ya usaste este cupón.'
    };
    return mensajes[codigo ?? ''] ?? 'No se pudo aplicar el cupón. Probá de nuevo.';
  }
}