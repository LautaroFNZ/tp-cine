import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth';
import { Rol } from '../models/perfil.model';

export const guardRol = (rolesPermitidos: Rol[]): CanActivateFn => {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);

    // Espera a que se restaure la sesión guardada (por ejemplo, al recargar la página)
    await auth.listo;

    if (!auth.estaAutenticado()) {
      return router.createUrlTree(['/login']);
    }

    const rol = auth.perfil()?.rol;
    if (rol && rolesPermitidos.includes(rol)) {
      return true;
    }

    return router.createUrlTree(['/']);
  };
};