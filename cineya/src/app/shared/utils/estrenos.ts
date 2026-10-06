// Días antes del estreno en que se abre la venta (preventa)
export const DIAS_PREVENTA = 7;

export type EstadoEstreno = 'cartelera' | 'preventa' | 'proximamente';

export interface InfoEstreno {
  estado: EstadoEstreno;
  estreno: Date;      // día del estreno (a las 00:00, hora local)
  ventaDesde: Date;   // día en que abre la venta (a las 00:00, hora local)
}

// "2026-10-20" -> Date a las 00:00 locales.
// Se arma con año, mes y día para evitar el desfase de huso horario de new Date('2026-10-20').
export function fechaDeDia(texto: string): Date {
  const [anio, mes, dia] = texto.slice(0, 10).split('-').map(Number);
  return new Date(anio, mes - 1, dia);
}

// Dónde está una película según su fecha de estreno:
// - cartelera: ya se estrenó
// - preventa: faltan 7 días o menos (la venta ya abrió)
// - proximamente: faltan más de 7 días (la venta todavía no abrió)
export function estadoDeEstreno(fechaEstreno: string, ahora: Date = new Date()): InfoEstreno {
  const estreno = fechaDeDia(fechaEstreno);
  const ventaDesde = new Date(estreno.getFullYear(), estreno.getMonth(), estreno.getDate() - DIAS_PREVENTA);
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());

  let estado: EstadoEstreno = 'proximamente';
  if (hoy.getTime() >= estreno.getTime()) {
    estado = 'cartelera';
  } else if (hoy.getTime() >= ventaDesde.getTime()) {
    estado = 'preventa';
  }
  return { estado, estreno, ventaDesde };
}