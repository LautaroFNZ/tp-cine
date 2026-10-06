// Fechas "AAAA-MM-DD" en hora local, que es el formato de los campos de fecha y de las consultas

function dosDigitos(numero: number): string {
  return String(numero).padStart(2, '0');
}

// Date -> "2026-10-05" (con el año, mes y día locales, sin desfase de huso horario)
export function aISO(fecha: Date): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

export function hoyISO(): string {
  return aISO(new Date());
}

// La fecha de hace N días (0 = hoy)
export function haceDiasISO(dias: number): string {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() - dias);
  return aISO(fecha);
}

// El primer día del mes actual
export function inicioDeMesISO(): string {
  const hoy = new Date();
  return aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
}

// "2026-10-05" -> "05/10/2026"
export function formatoDiaMes(iso: string): string {
  const [anio, mes, dia] = iso.split('-');
  return `${dia}/${mes}/${anio}`;
}