import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-dialogo-aviso',
  templateUrl: './dialogo-aviso.html',
  styleUrl: './dialogo-aviso.scss'
})
export class DialogoAviso {
  @Input({ required: true }) titulo!: string;
  @Input() textoBoton = 'Entendido';
  // Si tiene texto, el diálogo muestra un segundo botón para responder "no"
  @Input() textoCancelar = '';
  @Output() aceptado = new EventEmitter<void>();
  @Output() cancelado = new EventEmitter<void>();

  @ViewChild('dialogo', { static: true }) private dialogo!: ElementRef<HTMLDialogElement>;
  private respuesta: ((acepto: boolean) => void) | null = null;

  abrir() {
    if (!this.dialogo.nativeElement.open) {
      this.dialogo.nativeElement.showModal();
    }
  }

  // Abre el diálogo y espera la respuesta: true si acepta, false si cancela o se cierra
  preguntar(): Promise<boolean> {
    this.responder(false);   // si había otra pregunta pendiente, se descarta
    this.abrir();
    return new Promise<boolean>(resolver => (this.respuesta = resolver));
  }

  // Cierra el diálogo sin que el usuario responda (por ejemplo, si se agotó el tiempo)
  cerrar() {
    if (this.dialogo.nativeElement.open) {
      this.dialogo.nativeElement.close();
    }
    this.responder(false);
  }

  aceptar() {
    this.dialogo.nativeElement.close();
    this.aceptado.emit();
    this.responder(true);
  }

  cancelar() {
    this.dialogo.nativeElement.close();
    this.cancelado.emit();
    this.responder(false);
  }

  private responder(acepto: boolean) {
    this.respuesta?.(acepto);
    this.respuesta = null;
  }
}