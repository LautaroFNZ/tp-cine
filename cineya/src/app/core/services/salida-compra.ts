import { Service } from '@angular/core';

// Puente entre el guard de salida y el contenedor de la compra, que es quien tiene el diálogo.
// El contenedor registra acá cómo hacer la pregunta, y el guard la usa.
@Service()
export class SalidaCompraService {
  preguntar: (() => Promise<boolean>) | null = null;
}
