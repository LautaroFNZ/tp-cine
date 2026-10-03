import { Component, OnInit, inject, signal } from '@angular/core';
import { PuntosAdminService } from '../services/puntos-admin';
import { CandyAdminService } from '../services/candy-admin';

interface FilaRecompensa {
  clave: string;
  tipo: 'entrada' | 'producto';
  productoId: string | null;
  nombre: string;
  categoria: string;
  puntos: number;       // 0 = todavía sin configurar
  activa: boolean;
  configurada: boolean; // ya existe en la base
  guardando: boolean;
  mensaje: string | null;
  error: string | null;
}

@Component({
  selector: 'app-puntos-admin',
  templateUrl: './puntos-admin.html',
  styleUrl: './puntos-admin.scss'
})
export class PuntosAdmin implements OnInit {
  private puntosAdmin = inject(PuntosAdminService);
  private candyAdmin = inject(CandyAdminService);

  filas = signal<FilaRecompensa[]>([]);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);

  async ngOnInit() {
    try {
      const [recompensas, productos] = await Promise.all([
        this.puntosAdmin.listarRecompensas(),
        this.candyAdmin.listarProductos()
      ]);

      const entrada = recompensas.find(recompensa => recompensa.tipo === 'entrada');
      const filas: FilaRecompensa[] = [
        {
          clave: 'entrada',
          tipo: 'entrada',
          productoId: null,
          nombre: 'Entrada gratis',
          categoria: 'Entradas',
          puntos: entrada?.puntos ?? 0,
          activa: entrada?.activa ?? true,
          configurada: !!entrada,
          guardando: false,
          mensaje: null,
          error: null
        },
        ...productos
          .filter(producto => producto.activo)
          .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre))
          .map((producto): FilaRecompensa => {
            const existente = recompensas.find(recompensa => recompensa.productoId === producto.id);
            return {
              clave: producto.id,
              tipo: 'producto',
              productoId: producto.id,
              nombre: producto.nombre,
              categoria: producto.categoria,
              puntos: existente?.puntos ?? 0,
              activa: existente?.activa ?? true,
              configurada: !!existente,
              guardando: false,
              mensaje: null,
              error: null
            };
          })
      ];
      this.filas.set(filas);
    } catch {
      this.mensajeError.set('No se pudieron cargar las recompensas.');
    } finally {
      this.cargando.set(false);
    }
  }

  editarPuntos(clave: string, valor: string) {
    this.actualizar(clave, { puntos: Number(valor), mensaje: null, error: null });
  }

  editarActiva(clave: string, activa: boolean) {
    this.actualizar(clave, { activa, mensaje: null, error: null });
  }

  async guardar(fila: FilaRecompensa) {
    if (!Number.isInteger(fila.puntos) || fila.puntos < 1) {
      this.actualizar(fila.clave, { error: 'El costo tiene que ser un número entero de al menos 1 punto.', mensaje: null });
      return;
    }

    this.actualizar(fila.clave, { guardando: true, mensaje: null, error: null });
    try {
      await this.puntosAdmin.guardarRecompensa(fila.tipo, fila.productoId, fila.puntos, fila.activa);
      this.actualizar(fila.clave, { configurada: true, mensaje: 'Guardado' });
    } catch {
      this.actualizar(fila.clave, { error: 'No se pudo guardar. Verificá que tu usuario sea administrador.' });
    } finally {
      this.actualizar(fila.clave, { guardando: false });
    }
  }

  private actualizar(clave: string, cambios: Partial<FilaRecompensa>) {
    this.filas.update(lista =>
      lista.map(fila => (fila.clave === clave ? { ...fila, ...cambios } : fila))
    );
  }
}