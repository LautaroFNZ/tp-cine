import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { EntradaService } from '../../entrada/services/entradas';
import { ValidacionService } from '../services/validacion';
import { LectorQr } from '../lector-qr/lector-qr';
import { Compra } from '../../../core/models/compra.model';

registerLocaleData(localeEsAr);

@Component({
  selector: 'app-panel-empleado',
  imports: [DatePipe, LectorQr],
  templateUrl: './panel-empleado.html',
  styleUrl: './panel-empleado.scss'
})
export class PanelEmpleado {
  private entradaService = inject(EntradaService);
  private validacionService = inject(ValidacionService);

  codigo = signal('');
  compra = signal<Compra | null>(null);
  buscando = signal(false);
  procesando = signal(false);
  camaraAbierta = signal(false);
  error = signal<string | null>(null);
  mensaje = signal<string | null>(null);

  // 0 = película sin restricción de edad
  edadMinima = computed(() => {
    const clasificacion = this.compra()?.clasificacionEdad;
    return clasificacion && clasificacion !== 'none' ? Number(clasificacion) : 0;
  });

    // 'antes': la función es otro día · 'hoy': se puede validar · 'terminada': la función ya terminó
  estadoFuncion = computed<'antes' | 'hoy' | 'terminada'>(() => {
    const compra = this.compra();
    if (!compra) return 'hoy';
    if (Date.now() > Date.parse(compra.fin)) return 'terminada';

    const hoy = this.diaArgentina(new Date());
    const dia = this.diaArgentina(new Date(compra.inicio));
    return hoy < dia ? 'antes' : 'hoy';
  });

  diaFuncion = computed(() => {
    const compra = this.compra();
    return compra
      ? new Date(compra.inicio).toLocaleDateString('es-AR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          timeZone: 'America/Argentina/Buenos_Aires'
        })
      : '';
  });

  // Acepta el código con o sin guion, en mayúsculas o minúsculas
  private normalizar(texto: string): string {
    return texto.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  }

    // Día calendario en Argentina, como AAAA-MM-DD (se pueden comparar como texto)
  private diaArgentina(fecha: Date): string {
    return fecha.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  }

  alEscribir(valor: string) {
    this.codigo.set(valor);
  }

  async buscar() {
    const codigo = this.normalizar(this.codigo());
    this.error.set(null);
    this.mensaje.set(null);
    this.compra.set(null);

    if (codigo.length !== 10) {
      this.error.set('El código tiene 10 caracteres (por ejemplo, 2DEB7-DD87F).');
      return;
    }

    this.buscando.set(true);
    try {
      const compra = await this.entradaService.obtenerPorCodigo(codigo);
      if (compra) {
        this.compra.set(compra);
      } else {
        this.error.set('No hay ninguna compra con ese código.');
      }
    } catch {
      this.error.set('No se pudo buscar el código. Probá de nuevo.');
    } finally {
      this.buscando.set(false);
    }
  }

  // Un lector de códigos de barras escribe el código y manda Enter: se busca solo
  alApretarEnter(evento: Event) {
    evento.preventDefault();
    void this.buscar();
  }

  abrirCamara() {
    this.camaraAbierta.set(true);
  }

  cerrarCamara() {
    this.camaraAbierta.set(false);
  }

  // La cámara leyó un QR
  async alLeer(texto: string) {
    this.camaraAbierta.set(false);
    this.codigo.set(texto);
    await this.buscar();
  }

  async validarEntrada() {
    await this.ejecutar(
      codigo => this.validacionService.validarEntrada(codigo),
      'Entrada validada. El código ya no sirve para entrar.'
    );
  }

  async entregarCandy() {
    await this.ejecutar(
      codigo => this.validacionService.entregarCandy(codigo),
      'Productos entregados. El código ya no sirve para retirarlos.'
    );
  }

  nuevaConsulta() {
    this.codigo.set('');
    this.compra.set(null);
    this.error.set(null);
    this.mensaje.set(null);
  }

  private async ejecutar(accion: (codigo: string) => Promise<void>, textoExito: string) {
    const compra = this.compra();
    if (!compra) return;

    this.procesando.set(true);
    this.error.set(null);
    this.mensaje.set(null);
    try {
      await accion(compra.codigo);
      this.mensaje.set(textoExito);
    } catch (error: any) {
      const mensajes: Record<string, string> = {
        YA_UTILIZADA: 'Esta entrada ya fue utilizada.',
        YA_ENTREGADO: 'Los productos de esta compra ya fueron retirados.',
        SIN_CANDY: 'Esta compra no incluye productos del candy bar.',
        NO_ENCONTRADA: 'No hay ninguna compra con ese código.',
        SIN_PERMISO: 'Tu usuario no tiene permiso para validar entradas.',
        OTRO_DIA: 'Esta entrada es para otro día: solo se puede validar el día de la función.',
        FUNCION_TERMINADA: 'La función de esta entrada ya terminó.',
        CANCELADA: 'Esta compra fue cancelada: el código ya no sirve.',
      };
      this.error.set(mensajes[error?.message] ?? 'No se pudo completar la operación. Probá de nuevo.');
    } finally {
      // Se vuelve a leer la compra para mostrar el estado actualizado
      try {
        this.compra.set(await this.entradaService.obtenerPorCodigo(compra.codigo));
      } catch {
        // Si falla la lectura, se conserva lo que había
      }
      this.procesando.set(false);
    }
  }
}