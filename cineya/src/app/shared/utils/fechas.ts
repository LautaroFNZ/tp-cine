// Devuelve la fecha en formato YYYY-MM-DD según la hora local (no UTC)
export function fechaLocal(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

// Edad en años cumplidos. Recibe la fecha de nacimiento como YYYY-MM-DD.
export function calcularEdad(fechaNacimiento: string, hoy: Date = new Date()): number {
  const [anio, mes, dia] = fechaNacimiento.split('-').map(Number);
  let edad = hoy.getFullYear() - anio;
  const yaCumplio =
    hoy.getMonth() + 1 > mes || (hoy.getMonth() + 1 === mes && hoy.getDate() >= dia);
  if (!yaCumplio) edad--;
  return edad;
}

// Devuelve 'AAAA-MM-DD' si la fecha existe, no es futura y el año es 1900 o posterior; si no, ''
export function armarFecha(dia: number, mes: number, anio: number): string {
  if (anio < 1900) return '';
  const fecha = new Date(anio, mes - 1, dia);
  const existe =
    fecha.getFullYear() === anio && fecha.getMonth() === mes - 1 && fecha.getDate() === dia;
  if (!existe || fecha > new Date()) return '';
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}