import { Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, ViewChild, signal } from '@angular/core';

@Component({
  selector: 'app-lector-qr',
  templateUrl: './lector-qr.html',
  styleUrl: './lector-qr.scss'
})
export class LectorQr implements OnInit, OnDestroy {
  // Texto del QR leído
  @Output() leido = new EventEmitter<string>();
  @Output() cerrado = new EventEmitter<void>();

  @ViewChild('video', { static: true }) private video!: ElementRef<HTMLVideoElement>;

  error = signal<string | null>(null);
  iniciando = signal(true);

  private flujo: MediaStream | null = null;
  private activo = false;
  private temporizador: ReturnType<typeof setTimeout> | null = null;
  private lienzo = document.createElement('canvas');

  async ngOnInit() {
    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      const elemento = this.video.nativeElement;
      elemento.srcObject = this.flujo;
      await elemento.play();
      this.activo = true;
      this.iniciando.set(false);
      await this.buscar();
    } catch {
      this.iniciando.set(false);
      this.error.set(
        'No se pudo acceder a la cámara. Revisá los permisos del navegador o ingresá el código a mano.'
      );
    }
  }

  ngOnDestroy() {
    this.detener();
  }

  cerrar() {
    this.detener();
    this.cerrado.emit();
  }

  // Revisa un cuadro del video cada 150 ms hasta encontrar un QR
  private async buscar() {
    const modulo: any = await import('jsqr');
    const jsQR = modulo.default ?? modulo;

    const revisar = () => {
      if (!this.activo) return;

      const elemento = this.video.nativeElement;
      if (elemento.readyState === elemento.HAVE_ENOUGH_DATA && elemento.videoWidth > 0) {
        // Se achica la imagen para que la lectura sea rápida
        const escala = Math.min(1, 640 / elemento.videoWidth);
        const ancho = Math.round(elemento.videoWidth * escala);
        const alto = Math.round(elemento.videoHeight * escala);
        this.lienzo.width = ancho;
        this.lienzo.height = alto;

        const contexto = this.lienzo.getContext('2d', { willReadFrequently: true });
        if (contexto) {
          contexto.drawImage(elemento, 0, 0, ancho, alto);
          const imagen = contexto.getImageData(0, 0, ancho, alto);
          const resultado = jsQR(imagen.data, ancho, alto);
          if (resultado?.data) {
            this.detener();
            this.leido.emit(resultado.data);
            return;
          }
        }
      }
      this.temporizador = setTimeout(revisar, 150);
    };

    revisar();
  }

  // Apaga la cámara
  private detener() {
    this.activo = false;
    if (this.temporizador) clearTimeout(this.temporizador);
    this.flujo?.getTracks().forEach(pista => pista.stop());
    this.flujo = null;
  }
}