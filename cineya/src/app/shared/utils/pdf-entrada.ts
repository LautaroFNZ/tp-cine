import type { jsPDF } from 'jspdf';
import { Compra } from '../../core/models/compra.model';

const ROJO: [number, number, number] = [227, 36, 43];
const OSCURO: [number, number, number] = [26, 26, 26];
const GRIS: [number, number, number] = [110, 110, 110];
const NEGRO: [number, number, number] = [17, 17, 17];

// Genera el PDF de la entrada y lo descarga. La librería se carga solo cuando hace falta.
export async function descargarPdfEntrada(compra: Compra, qr: string): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const documento = construirPdfEntrada(new jsPDF({ unit: 'mm', format: 'a4' }), compra, qr);
  documento.save(`entrada-${compra.codigo}.pdf`);
}

export function construirPdfEntrada(doc: jsPDF, compra: Compra, qr: string): jsPDF {
  const ancho = 210;
  const margen = 20;
  const derecha = ancho - margen;
  let y = 0;

  // Encabezado
  doc.setFillColor(...OSCURO);
  doc.rect(0, 0, ancho, 38, 'F');
  doc.setFillColor(...ROJO);
  doc.rect(0, 38, ancho, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(255, 255, 255);
  doc.text('CINE', margen, 25);
  doc.setTextColor(...ROJO);
  doc.text('YA', margen + doc.getTextWidth('CINE'), 25);

  doc.setFontSize(11);
  doc.setTextColor(180, 180, 180);
  doc.text('ENTRADA', derecha, 25, { align: 'right' });

  // Película y función
  y = 56;
  doc.setTextColor(...NEGRO);
  doc.setFontSize(20);
  const titulo = doc.splitTextToSize(compra.pelicula, ancho - margen * 2) as string[];
  doc.text(titulo, margen, y);
  y += titulo.length * 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.setTextColor(...NEGRO);
  doc.text(fechaHora(compra.inicio), margen, y);
  y += 7;
  doc.setTextColor(...GRIS);
  doc.text(`${compra.sala} · ${compra.formato} · ${compra.idioma}`, margen, y);
  y += 10;

  // Aclaración para películas con restricción de edad
  const edad = compra.clasificacionEdad === 'none' ? 0 : Number(compra.clasificacionEdad);
  if (edad > 0) {
    doc.setDrawColor(...ROJO);
    doc.setLineWidth(0.5);
    doc.roundedRect(margen, y, ancho - margen * 2, 12, 2, 2, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...ROJO);
    doc.text(
      `Película para mayores de ${edad} años. Debe asistir un adulto.`,
      ancho / 2,
      y + 7.6,
      { align: 'center' }
    );
    y += 20;
  }

  // Butacas
  y = seccion(doc, 'BUTACAS', y, margen, derecha);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  for (const entrada of compra.entradas) {
    doc.setTextColor(...NEGRO);
    const tipo = entrada.tipo === 'vip' ? '  (VIP)' : entrada.tipo === 'accessible' ? '  (accesible)' : '';
    doc.text(`Fila ${entrada.fila} · butaca ${entrada.numero}${tipo}`, margen, y);
    doc.setTextColor(...GRIS);
    doc.text(moneda(entrada.precio), derecha, y, { align: 'right' });
    y += 6.5;
  }

  // Entradas canjeadas con puntos
  if (compra.creditoPuntos && compra.creditoPuntos > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...NEGRO);
    doc.text('Entradas canjeadas con puntos', margen, y);
    doc.setTextColor(...GRIS);
    doc.text(`- ${moneda(compra.creditoPuntos)}`, derecha, y, { align: 'right' });
    y += 6.5;
  }

    // Combos
  if (compra.combos && compra.combos.length > 0) {
    y += 3;
    y = seccion(doc, 'COMBOS', y, margen, derecha);
    for (const combo of compra.combos) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.setTextColor(...NEGRO);
      doc.text(`${combo.cantidad} x ${combo.nombre}`, margen, y);
      doc.setTextColor(...GRIS);
      doc.text(moneda(combo.precioUnitario * combo.cantidad), derecha, y, { align: 'right' });
      y += 5.5;

      // Qué trae el combo, en letra más chica (puede ocupar más de un renglón)
      doc.setFontSize(9);
      const detalle = doc.splitTextToSize(
        `Incluye en total: ${combo.incluye.map(item => `${item.cantidad} x ${item.nombre}`).join(', ')}`,
        ancho - margen * 2 - 4
      ) as string[];
      doc.text(detalle, margen + 4, y);
      y += detalle.length * 4.2 + 2.5;
    }
    if (compra.creditoCombos && compra.creditoCombos > 0) {
      doc.setFontSize(11);
      doc.setTextColor(...NEGRO);
      doc.text('Entradas incluidas en combos', margen, y);
      doc.setTextColor(...GRIS);
      doc.text(`- ${moneda(compra.creditoCombos)}`, derecha, y, { align: 'right' });
      y += 6.5;
    }
  }

  // Candy bar
  if (compra.productos.length > 0) {
    y += 3;
    y = seccion(doc, 'CANDY BAR', y, margen, derecha);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    for (const producto of compra.productos) {
      doc.setTextColor(...NEGRO);
      doc.text(`${producto.cantidad} x ${producto.nombre}`, margen, y);
      doc.setTextColor(...GRIS);
      doc.text(
        producto.puntos ? `Canje - ${producto.puntos} puntos` : moneda(producto.precioUnitario * producto.cantidad),
        derecha,
        y,
        { align: 'right' }
      );
      y += 6.5;
    }
  }

  // Descuento
  if (compra.descuento && compra.descuento > 0) {
    y += 3;
    y = seccion(doc, 'DESCUENTO', y, margen, derecha);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...NEGRO);
    doc.text(compra.descuentoEtiqueta ?? 'Descuento', margen, y);
    doc.setTextColor(...GRIS);
    doc.text(`- ${moneda(compra.descuento)}`, derecha, y, { align: 'right' });
    y += 6.5;
  }

  // Total
  y += 2;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(margen, y, derecha, y);
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...NEGRO);
  doc.text('Total', margen, y);
  doc.text(moneda(compra.total), derecha, y, { align: 'right' });
  y += 12;

  // Código QR: se achica si hay mucho contenido y, si ni así entra, pasa a la hoja siguiente
  let tamanoQr = Math.min(56, 276 - y - 18);
  if (tamanoQr < 40) {
    doc.addPage();
    y = 30;
    tamanoQr = 56;
  }
  
  doc.addImage(qr, 'PNG', (ancho - tamanoQr) / 2, y, tamanoQr, tamanoQr);
  y += tamanoQr + 9;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(...NEGRO);
  doc.text(codigoFormateado(compra.codigo), ancho / 2, y, { align: 'center' });
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(
    `Comprada el ${fecha(compra.creadaEn)}${metodo(compra.metodoPago)}`,
    ancho / 2,
    y,
    { align: 'center' }
  );

  // Pie
  doc.setFontSize(9);
  doc.text(
    'Presentá este código en la entrada de la sala y en el candy bar. Una vez utilizado, deja de ser válido.',
    ancho / 2,
    287,
    { align: 'center', maxWidth: ancho - margen * 2 }
  );

  return doc;
}

function seccion(doc: jsPDF, texto: string, y: number, margen: number, derecha: number): number {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...GRIS);
  doc.text(texto, margen, y);
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.2);
  doc.line(margen, y + 2, derecha, y + 2);
  return y + 9;
}

function moneda(valor: number): string {
  return `$ ${valor.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`;
}

function codigoFormateado(codigo: string): string {
  return `${codigo.slice(0, 5)}-${codigo.slice(5)}`;
}

function fechaHora(iso: string): string {
  const texto = new Date(iso).toLocaleString('es-AR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires'
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'America/Argentina/Buenos_Aires'
  });
}

function metodo(valor: string | null): string {
  return valor === 'wallet' ? ' · Billetera virtual' : valor === 'card' ? ' · Tarjeta' : '';
}