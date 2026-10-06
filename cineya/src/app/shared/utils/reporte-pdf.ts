import type { jsPDF } from 'jspdf';
import { ItemRanking, VentaDiaria } from '../../features/admin/services/reporte-admin';
import { formatoDiaMes } from './rango-fechas';

const ROJO: [number, number, number] = [227, 36, 43];
const OSCURO: [number, number, number] = [26, 26, 26];
const GRIS: [number, number, number] = [110, 110, 110];
const NEGRO: [number, number, number] = [17, 17, 17];
const LINEA: [number, number, number] = [210, 210, 210];

// Todo lo que lleva el reporte
export interface DatosReporte {
  desde: string;
  hasta: string;
  ventas: VentaDiaria[];
  peliculasSemana: ItemRanking[];
  peliculasMes: ItemRanking[];
  productos: ItemRanking[];
}

// Genera el PDF del reporte y lo descarga. La librería se carga solo cuando hace falta.
export async function descargarPdfReporte(datos: DatosReporte): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const documento = construirPdfReporte(new jsPDF({ unit: 'mm', format: 'a4' }), datos);
  documento.save(`reporte-cineya-${datos.desde}-a-${datos.hasta}.pdf`);
}

export function construirPdfReporte(doc: jsPDF, datos: DatosReporte): jsPDF {
  const ancho = 210;
  const alto = 297;
  const margen = 18;
  const derecha = ancho - margen;
  const limiteInferior = alto - 20;

  // Encabezado
  doc.setFillColor(...OSCURO);
  doc.rect(0, 0, ancho, 30, 'F');
  doc.setFillColor(...ROJO);
  doc.rect(0, 30, ancho, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text('CINE', margen, 20);
  doc.setTextColor(...ROJO);
  doc.text('YA', margen + doc.getTextWidth('CINE'), 20);
  doc.setFontSize(10);
  doc.setTextColor(180, 180, 180);
  doc.text('REPORTE DE FACTURACIÓN', derecha, 20, { align: 'right' });

  let y = 44;
  doc.setTextColor(...NEGRO);
  doc.setFontSize(14);
  doc.text(`Del ${formatoDiaMes(datos.desde)} al ${formatoDiaMes(datos.hasta)}`, margen, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(`Generado el ${new Date().toLocaleString('es-AR')}. No incluye las compras canceladas.`, margen, y + 6);
  y += 16;

  // Totales
  const facturado = datos.ventas.reduce((suma, v) => suma + v.facturado, 0);
  const entradas = datos.ventas.reduce((suma, v) => suma + v.entradas, 0);
  const compras = datos.ventas.reduce((suma, v) => suma + v.compras, 0);
  const totales: [string, string][] = [
    ['Facturado', moneda(facturado)],
    ['Entradas vendidas', String(entradas)],
    ['Compras', String(compras)],
    ['Promedio por compra', moneda(compras > 0 ? facturado / compras : 0)]
  ];
  const anchoCaja = (derecha - margen - 9) / 4;
  totales.forEach(([rotulo, valor], i) => {
    const x = margen + i * (anchoCaja + 3);
    doc.setDrawColor(...LINEA);
    doc.setLineWidth(0.3);
    doc.rect(x, y, anchoCaja, 18);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(rotulo.toUpperCase(), x + 3, y + 6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...NEGRO);
    doc.text(valor, x + 3, y + 14);
  });
  y += 28;

  // Tabla por día: si no entra en la hoja, sigue en la siguiente
  y = titulo(doc, 'FACTURACIÓN POR DÍA', y, margen, derecha);
  y = encabezadoTabla(doc, y, margen, derecha);
  for (const venta of datos.ventas) {
    if (y > limiteInferior) {
      doc.addPage();
      y = 24;
      y = encabezadoTabla(doc, y, margen, derecha);
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...(venta.compras === 0 ? GRIS : NEGRO));
    doc.text(formatoDiaMes(venta.dia), margen + 1, y);
    doc.text(String(venta.compras), margen + 62, y, { align: 'right' });
    doc.text(String(venta.entradas), margen + 100, y, { align: 'right' });
    doc.text(moneda(venta.facturado), derecha - 1, y, { align: 'right' });
    doc.setDrawColor(...LINEA);
    doc.setLineWidth(0.1);
    doc.line(margen, y + 1.8, derecha, y + 1.8);
    y += 6;
  }
  y += 6;

  // Rankings
  const bloques: [string, ItemRanking[], string][] = [
    ['PELÍCULAS MÁS VENDIDAS, ÚLTIMOS 7 DÍAS', datos.peliculasSemana, 'entradas'],
    ['PELÍCULAS MÁS VENDIDAS, ÚLTIMOS 30 DÍAS', datos.peliculasMes, 'entradas'],
    ['PRODUCTOS DEL CANDY BAR MÁS VENDIDOS (DEL PERÍODO)', datos.productos, 'unidades']
  ];
  for (const [rotulo, items, unidad] of bloques) {
    const necesario = 14 + Math.max(items.length, 1) * 6;
    if (y + necesario > limiteInferior) {
      doc.addPage();
      y = 24;
    }
    y = titulo(doc, rotulo, y, margen, derecha);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    if (items.length === 0) {
      doc.setTextColor(...GRIS);
      doc.text('Sin ventas en el período.', margen + 1, y);
      y += 8;
      continue;
    }
    items.forEach((item, i) => {
      doc.setTextColor(...NEGRO);
      doc.text(`${i + 1}. ${recortar(item.nombre, 60)}`, margen + 1, y);
      doc.text(`${item.cantidad} ${unidad}`, derecha - 1, y, { align: 'right' });
      y += 6;
    });
    y += 6;
  }

  // Número de página
  const paginas = doc.getNumberOfPages();
  for (let pagina = 1; pagina <= paginas; pagina++) {
    doc.setPage(pagina);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRIS);
    doc.text(`Página ${pagina} de ${paginas}`, ancho / 2, alto - 10, { align: 'center' });
  }
  return doc;
}

function titulo(doc: jsPDF, texto: string, y: number, margen: number, derecha: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(texto, margen, y);
  doc.setDrawColor(...ROJO);
  doc.setLineWidth(0.5);
  doc.line(margen, y + 2, derecha, y + 2);
  return y + 9;
}

function encabezadoTabla(doc: jsPDF, y: number, margen: number, derecha: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text('Día', margen + 1, y);
  doc.text('Compras', margen + 62, y, { align: 'right' });
  doc.text('Entradas', margen + 100, y, { align: 'right' });
  doc.text('Facturado', derecha - 1, y, { align: 'right' });
  doc.setDrawColor(...NEGRO);
  doc.setLineWidth(0.3);
  doc.line(margen, y + 1.8, derecha, y + 1.8);
  return y + 6.5;
}

function moneda(valor: number): string {
  return `$ ${valor.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function recortar(texto: string, largo: number): string {
  return texto.length > largo ? texto.slice(0, largo - 1) + '…' : texto;
}