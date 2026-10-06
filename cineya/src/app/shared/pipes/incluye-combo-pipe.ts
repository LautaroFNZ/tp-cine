import { Pipe, PipeTransform } from '@angular/core';

// Convierte los productos de un combo en un texto: "1 × Pochoclo grande, 1 × Gaseosa 500 ml"
@Pipe({ name: 'incluyeCombo' })
export class IncluyeComboPipe implements PipeTransform {
  transform(incluye: { nombre: string; cantidad: number }[] | null | undefined, separador = ', '): string {
    return (incluye ?? []).map(item => `${item.cantidad} × ${item.nombre}`).join(separador);
  }
}