import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-dialogo-aviso',
  templateUrl: './dialogo-aviso.html',
  styleUrl: './dialogo-aviso.scss'
})
export class DialogoAviso {
  @Input({ required: true }) titulo!: string;
  @Input() textoBoton = 'Entendido';
  @Output() aceptado = new EventEmitter<void>();

  @ViewChild('dialogo', { static: true }) private dialogo!: ElementRef<HTMLDialogElement>;

  abrir() {
    if (!this.dialogo.nativeElement.open) {
      this.dialogo.nativeElement.showModal();
    }
  }

  aceptar() {
    this.dialogo.nativeElement.close();
    this.aceptado.emit();
  }
}
