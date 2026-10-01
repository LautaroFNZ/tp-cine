import { Component, OnInit, inject, signal } from '@angular/core';
import { PeliculaAdminService } from '../services/pelicula-admin';
import { FormularioPelicula } from '../formulario-pelicula/formulario-pelicula';
import { EdadMinimaPipe } from '../../../shared/pipes/edad-minima-pipe';
import { Pelicula } from '../../../core/models/pelicula.model';

@Component({
  selector: 'app-peliculas-admin',
  imports: [FormularioPelicula, EdadMinimaPipe],
  templateUrl: './peliculas-admin.html',
  styleUrl: './peliculas-admin.scss'
})
export class PeliculasAdmin implements OnInit {
  private peliculaAdmin = inject(PeliculaAdminService);

  peliculas = signal<Pelicula[]>([]);
  cargando = signal(true);
  mensajeError = signal<string | null>(null);

  formularioAbierto = signal(false);
  peliculaEnEdicion = signal<Pelicula | null>(null);

  async ngOnInit() {
    await this.cargar();
  }

  nueva() {
    this.peliculaEnEdicion.set(null);
    this.formularioAbierto.set(true);
  }

  editar(pelicula: Pelicula) {
    this.peliculaEnEdicion.set(pelicula);
    this.formularioAbierto.set(true);
  }

  cerrarFormulario() {
    this.formularioAbierto.set(false);
    this.peliculaEnEdicion.set(null);
  }

  async alGuardar() {
    this.cerrarFormulario();
    await this.cargar();
  }

  async alternarVisibilidad(pelicula: Pelicula) {
    this.mensajeError.set(null);
    const nuevoEstado = !pelicula.activa;
    try {
      await this.peliculaAdmin.cambiarVisibilidad(pelicula.id, nuevoEstado);
      this.peliculas.update(lista =>
        lista.map(item => (item.id === pelicula.id ? { ...item, activa: nuevoEstado } : item))
      );
    } catch {
      this.mensajeError.set('No se pudo cambiar la visibilidad. Verificá que tu usuario sea administrador.');
    }
  }

  private async cargar() {
    this.mensajeError.set(null);
    try {
      this.peliculas.set(await this.peliculaAdmin.listar());
    } catch {
      this.mensajeError.set('No se pudieron cargar las películas.');
    } finally {
      this.cargando.set(false);
    }
  }
}