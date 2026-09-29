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