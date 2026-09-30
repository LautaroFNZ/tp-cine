// Pasa a minúsculas y quita las tildes: "Rápidos" -> "rapidos"
export function normalizarTexto(texto: string): string {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}