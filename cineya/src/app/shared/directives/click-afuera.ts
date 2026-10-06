import { Directive, ElementRef, EventEmitter, HostListener, Output, inject } from '@angular/core';

// Directiva de atributo: avisa cuando el usuario hace clic fuera del elemento
// (o aprieta Escape). Sirve para cerrar menús desplegables.
@Directive({ selector: '[appClickAfuera]' })
export class ClickAfueraDirective {
  // ElementRef da acceso al elemento del DOM donde se puso la directiva
  private elemento = inject<ElementRef<HTMLElement>>(ElementRef);

  @Output() clickAfuera = new EventEmitter<void>();

  @HostListener('document:click', ['$event.target'])
  alHacerClick(destino: EventTarget | null) {
    if (destino instanceof Node && !this.elemento.nativeElement.contains(destino)) {
      this.clickAfuera.emit();
    }
  }

  @HostListener('document:keydown.escape')
  alApretarEscape() {
    this.clickAfuera.emit();
  }
}