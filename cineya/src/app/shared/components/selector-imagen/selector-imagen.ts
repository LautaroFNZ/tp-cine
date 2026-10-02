import {
  Component, EventEmitter, Input, OnChanges, OnDestroy, Output, computed, signal
} from '@angular/core';

export interface SeleccionImagen {
  archivo: File | null;   // archivo elegido (modo "subir archivo")
  enlace: string;         // enlace https válido (modo "pegar enlace")
  valido: boolean;        // false si lo elegido tiene un error
}

const LIMITE = 2 * 1024 * 1024;   // 2 MB
const TIPOS = ['image/jpeg', 'image/png', 'image/webp'];

@Component({
  selector: 'app-selector-imagen',
  templateUrl: './selector-imagen.html',
  styleUrl: './selector-imagen.scss'
})
export class SelectorImagen implements OnChanges, OnDestroy {
  // Imagen que ya tiene el registro (al editar), para mostrarla como vista previa
  @Input() imagenActual = '';
  @Output() elegida = new EventEmitter<SeleccionImagen>();

  modo = signal<'archivo' | 'enlace'>('archivo');
  archivo = signal<File | null>(null);
  urlArchivo = signal<string | null>(null);
  enlace = signal('');
  error = signal<string | null>(null);
  actual = signal('');

  enlaceValido = computed(() => {
    try {
      return new URL(this.enlace().trim()).protocol === 'https:';
    } catch {
      return false;
    }
  });

  vistaPrevia = computed(() => {
    if (this.modo() === 'archivo') {
      return this.urlArchivo() ?? this.actual();
    }
    return this.enlaceValido() ? this.enlace().trim() : this.actual();
  });

  // Cuando el formulario cambia de registro, el selector arranca de nuevo
  ngOnChanges() {
    this.liberarVistaPrevia();
    this.archivo.set(null);
    this.enlace.set('');
    this.error.set(null);
    this.modo.set('archivo');
    this.actual.set(this.imagenActual);
  }

  ngOnDestroy() {
    this.liberarVistaPrevia();
  }

  cambiarModo(modo: 'archivo' | 'enlace') {
    this.modo.set(modo);
    this.error.set(null);
    this.emitir();
  }

  elegirArchivo(evento: Event) {
    const campo = evento.target as HTMLInputElement;
    const elegido = campo.files?.[0] ?? null;
    this.error.set(null);
    this.liberarVistaPrevia();
    this.archivo.set(null);

    if (elegido) {
      if (!TIPOS.includes(elegido.type)) {
        this.error.set('Elegí una imagen JPG, PNG o WEBP.');
        campo.value = '';
      } else if (elegido.size > LIMITE) {
        this.error.set('La imagen no puede superar los 2 MB.');
        campo.value = '';
      } else {
        this.archivo.set(elegido);
        this.urlArchivo.set(URL.createObjectURL(elegido));
      }
    }
    this.emitir();
  }

  escribirEnlace(valor: string) {
    this.enlace.set(valor);
    this.emitir();
  }

  private emitir() {
    const enArchivo = this.modo() === 'archivo';
    const texto = this.enlace().trim();
    this.elegida.emit({
      archivo: enArchivo ? this.archivo() : null,
      enlace: !enArchivo && this.enlaceValido() ? texto : '',
      valido: !this.error() && (enArchivo || texto === '' || this.enlaceValido())
    });
  }

  private liberarVistaPrevia() {
    const url = this.urlArchivo();
    if (url) URL.revokeObjectURL(url);
    this.urlArchivo.set(null);
  }
}