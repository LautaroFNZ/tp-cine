import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth';
import { CarritoService } from '../../../core/services/carrito';
import { ButacaService } from '../services/butacas';
import { DescuentoService } from '../services/descuentos';
import { ResumenCompra } from '../resumen-compra/resumen-compra';

registerLocaleData(localeEsAr);

type MetodoPago = 'card' | 'wallet';

@Component({
  selector: 'app-paso-pago',
  imports: [ResumenCompra, RouterLink, CurrencyPipe],
  templateUrl: './paso-pago.html',
  styleUrl: './paso-pago.scss'
})
export class PasoPago implements OnInit {
  private router = inject(Router);
  private rutaActiva = inject(ActivatedRoute);
  private carrito = inject(CarritoService);
  private butacaService = inject(ButacaService);
  private descuentoService = inject(DescuentoService);
  auth = inject(AuthService);

  metodos: { valor: MetodoPago; texto: string }[] = [
    { valor: 'card', texto: 'Tarjeta de crédito o débito' },
    { valor: 'wallet', texto: 'Billetera virtual' }
  ];
  metodo = signal<MetodoPago>('card');

  pagando = signal(false);
  codigo = signal<string | null>(null);
  totalPagado = signal(0);
  mensajeError = signal<string | null>(null);

  // Cupón: lo que escribe el usuario y el código que la base ya comprobó
  cupon = signal('');
  cuponValidado = signal<string | null>(null);
  aplicandoCupon = signal(false);
  mensajeCupon = signal<string | null>(null);
  errorCupon = signal<string | null>(null);

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
  }

  volver() {
    this.router.navigate(['../candy'], { relativeTo: this.rutaActiva });
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
    try {
      await this.recalcularDescuento('');
    } catch {
      // Se conserva lo que había
    }
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
      const resultado = await this.butacaService.comprar(
        estado.funcionId,
        estado.butacas.map(butaca => butaca.id),
        estado.items.map(item => ({ productoId: item.producto.id, cantidad: item.cantidad })),
        this.metodo(),
        this.cuponValidado()
      );

      this.totalPagado.set(total);
      this.codigo.set(resultado.codigo);
      this.carrito.vaciar();
      this.carrito.establecerCompraRealizada(true);
    } catch (error: any) {
      const mensaje: string = error?.message ?? '';
      if (mensaje === 'RESERVA_VENCIDA') {
        this.mensajeError.set('Tu reserva venció. Volvé al mapa para elegir las butacas de nuevo.');
      } else if (mensaje === 'PRODUCTO_NO_DISPONIBLE') {
        this.mensajeError.set('Alguno de los productos ya no está disponible. Volvé al candy bar y revisá tu elección.');
      } else if (mensaje.startsWith('CUPON_')) {
        this.mensajeError.set(this.textoErrorCupon(mensaje));
      } else {
        this.mensajeError.set('No se pudo completar la compra. Probá de nuevo.');
      }
    } finally {
      this.pagando.set(false);
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