import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CurrencyPipe, NgStyle, NgTemplateOutlet, registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import { ItemRanking, ReporteAdminService, VentaDiaria } from '../services/reporte-admin';
import { DatosReporte, descargarPdfReporte } from '../../../shared/utils/reporte-pdf';
import { descargarExcelReporte } from '../../../shared/utils/reporte-excel';
import { formatoDiaMes, haceDiasISO, hoyISO, inicioDeMesISO } from '../../../shared/utils/rango-fechas';

registerLocaleData(localeEsAr);

@Component({
  selector: 'app-reportes-admin',
  imports: [CurrencyPipe, NgStyle, NgTemplateOutlet],
  templateUrl: './reportes-admin.html',
  styleUrl: './reportes-admin.scss'
})
export class ReportesAdmin implements OnInit {
  private reportes = inject(ReporteAdminService);

  // Rango del reporte: por defecto, lo que va del mes
  desde = signal(inicioDeMesISO());
  hasta = signal(hoyISO());

  ventas = signal<VentaDiaria[]>([]);
  peliculasSemana = signal<ItemRanking[]>([]);
  peliculasMes = signal<ItemRanking[]>([]);
  productos = signal<ItemRanking[]>([]);

  cargando = signal(false);
  exportando = signal<'pdf' | 'excel' | null>(null);
  mensajeError = signal<string | null>(null);
  // El rango con el que se armó el reporte que se está viendo (es el que se exporta)
  rangoMostrado = signal<{ desde: string; hasta: string } | null>(null);

  // Totales del período
  totalFacturado = computed(() => this.ventas().reduce((suma, v) => suma + v.facturado, 0));
  totalEntradas = computed(() => this.ventas().reduce((suma, v) => suma + v.entradas, 0));
  totalCompras = computed(() => this.ventas().reduce((suma, v) => suma + v.compras, 0));
  promedioCompra = computed(() =>
    this.totalCompras() > 0 ? this.totalFacturado() / this.totalCompras() : 0
  );

  // Valores máximos: con ellos se calcula el alto o el ancho de cada barra de los gráficos
  maxFacturado = computed(() => Math.max(0, ...this.ventas().map(v => v.facturado)));
  maxSemana = computed(() => Math.max(1, ...this.peliculasSemana().map(p => p.cantidad)));
  maxMes = computed(() => Math.max(1, ...this.peliculasMes().map(p => p.cantidad)));
  maxProductos = computed(() => Math.max(1, ...this.productos().map(p => p.cantidad)));

  async ngOnInit() {
    await this.generar();
  }

  rangoRapido(rango: 'hoy' | 'semana' | 'mes') {
    this.hasta.set(hoyISO());
    this.desde.set(
      rango === 'hoy' ? hoyISO() : rango === 'semana' ? haceDiasISO(6) : inicioDeMesISO()
    );
    this.generar();
  }

  async generar() {
    const desde = this.desde();
    const hasta = this.hasta();
    this.mensajeError.set(null);

    if (!desde || !hasta) {
      this.mensajeError.set('Elegí las dos fechas del período.');
      return;
    }
    if (desde > hasta) {
      this.mensajeError.set('La fecha "desde" no puede ser posterior a la fecha "hasta".');
      return;
    }

    this.cargando.set(true);
    try {
      // Las películas más vendidas "por semana" y "por mes" son siempre los últimos 7 y 30 días;
      // las ventas y los productos siguen el rango elegido
      const [ventas, semana, mes, productos] = await Promise.all([
        this.reportes.ventasPorDia(desde, hasta),
        this.reportes.peliculasMasVendidas(haceDiasISO(6), hoyISO(), 5),
        this.reportes.peliculasMasVendidas(haceDiasISO(29), hoyISO(), 5),
        this.reportes.productosMasVendidos(desde, hasta, 5)
      ]);
      this.ventas.set(ventas);
      this.peliculasSemana.set(semana);
      this.peliculasMes.set(mes);
      this.productos.set(productos);
      this.rangoMostrado.set({ desde, hasta });
    } catch (error: any) {
      const mensajes: Record<string, string> = {
        SIN_PERMISO: 'Solo un administrador puede ver los reportes.',
        RANGO_INVALIDO: 'El período elegido no es válido.',
        RANGO_MUY_GRANDE: 'El período no puede superar un año (366 días).'
      };
      this.mensajeError.set(mensajes[error?.message] ?? 'No se pudo generar el reporte. Probá de nuevo.');
    } finally {
      this.cargando.set(false);
    }
  }

  async exportarPdf() {
    await this.exportar('pdf', descargarPdfReporte);
  }

  async exportarExcel() {
    await this.exportar('excel', descargarExcelReporte);
  }

  // Altura (en %) de la columna de un día en el gráfico de facturación
  altura(facturado: number): number {
    const maximo = this.maxFacturado();
    if (maximo <= 0 || facturado <= 0) return 0;
    return Math.max(3, Math.round((facturado / maximo) * 100));
  }

  // Ancho (en %) de la barra de un ranking, medida contra el primero
  ancho(cantidad: number, maximo: number): number {
    return Math.round((cantidad / maximo) * 100);
  }

  // El día del mes para la etiqueta del gráfico: "2026-10-05" -> "5"
  diaDelMes(iso: string): string {
    return String(Number(iso.slice(8, 10)));
  }

  descripcionDia(venta: VentaDiaria): string {
    return `${this.formatoDia(venta.dia)}: ${venta.compras} compras, ${venta.entradas} entradas, $ ${venta.facturado.toLocaleString('es-AR')}`;
  }

  formatoDia(iso: string): string {
    return formatoDiaMes(iso);
  }

  private async exportar(formato: 'pdf' | 'excel', descargar: (datos: DatosReporte) => Promise<void>) {
    const rango = this.rangoMostrado();
    if (!rango) return;

    this.exportando.set(formato);
    this.mensajeError.set(null);
    try {
      await descargar({
        desde: rango.desde,
        hasta: rango.hasta,
        ventas: this.ventas(),
        peliculasSemana: this.peliculasSemana(),
        peliculasMes: this.peliculasMes(),
        productos: this.productos()
      });
    } catch {
      this.mensajeError.set(`No se pudo generar el archivo ${formato === 'pdf' ? 'PDF' : 'Excel'}. Probá de nuevo.`);
    } finally {
      this.exportando.set(null);
    }
  }
}