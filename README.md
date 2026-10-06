# CineYa

Sistema web de venta de entradas para un cine de un solo edificio con varias salas. Los clientes exploran la cartelera y los estrenos, ven reseñas, eligen butacas en un mapa con ocupación en tiempo real, compran entradas y productos del candy bar, y reciben una entrada en PDF con un código QR. El personal del cine valida las entradas y el administrador gestiona películas, funciones, precios, combos, cupones y recompensas.

Trabajo Práctico N.º 1 — Programación IV (2026, 2.º cuatrimestre).

**Aplicación publicada:** https://tp1-progra4-lf.web.app
**Código:** https://github.com/LautaroFNZ/tp-cine

---

## Tecnologías

| Pieza | Uso |
|---|---|
| **Angular 22** | Frontend: componentes standalone, signals, control flow (`@if`, `@for`, `@let`), Signal Forms, lazy loading, guards, pipes y directivas propias |
| **Supabase** | Backend: Postgres, Auth, Realtime, Storage, RLS, funciones SQL y triggers |
| **PWA** | `@angular/pwa`: manifest y service worker |
| **jsPDF, qrcode, jsQR y write-excel-file** | Entrada en PDF, código QR, lectura del QR con la cámara y reporte de facturación en PDF y Excel |
| **SCSS** | Estilo propio con variables CSS, sin librería de UI |
| **Fontsource** | Bebas Neue (títulos) y Poppins (texto), empaquetadas con la app |
| **Firebase Hosting** | Publicación de la aplicación |

Las versiones exactas están en `cineya/package.json` y en el documento de decisiones técnicas.

## Qué incluye

**Para el cliente**

- Portada con buscador por texto y filtro por género (una película puede tener varios) y dos secciones: **Cartelera** y **Estrenos**. Un menú baja hasta cada sección.
- **Estrenos y preventa:** la venta se abre 7 días antes del estreno, con un precio especial de preventa que se configura película por película. Se puede activar una **alerta** para que avisen cuando abra la venta.
- Reseñas con estrellas y comentario, y promedio visible en la cartelera y en el detalle.
- Registro e inicio de sesión (Supabase Auth). Compra también **sin cuenta**, salvo películas con restricción de edad.
- **Mapa de butacas en tiempo real**, con butacas accesibles y VIP diferenciadas y una reserva de 5 minutos mientras se compra.
- **Compra por pasos:** butacas, candy bar (productos y **combos**) y pago (simulado).
- **Descuento de bienvenida** y **cupones**, **puntos** (1 por peso, canjeables por entradas y productos), **crédito** y **cancelación** hasta 2 horas antes de la función.
- **Entrada en PDF con código QR**, de un solo uso.
- **Mi cuenta:** detalles, Mis compras (con su estado), Mis puntos y Mi crédito.

**Para el personal**

- Panel de **empleados**: validación de la entrada y entrega del candy escaneando el QR con la cámara o escribiendo el código a mano. Solo el día de la función, una sola vez.

**Para el administrador**

- Panel con pestañas: **películas** (alta, edición, ocultar, imagen, géneros y preventa), **funciones** con **asignación automática de sala** (nunca dos a la vez en una sala y siempre 30 minutos entre una y la siguiente), **precios**, **candy bar**, **cupones**, **fidelización** (costo en puntos de cada recompensa), **combos**, **reportes** (facturación por día, películas y productos más vendidos, con exportación a PDF y Excel) y **salas** (agregar una sala nueva, con sus butacas).

El detalle de lo que falta está al final de este documento.

## Cómo correrlo en local

### Requisitos

- **Node.js 24** (Angular 22 requiere 22.22 o superior, o 24.13.1 o superior)
- **Git**
- Angular CLI (`npm install -g @angular/cli`), o usar `npx ng`

### Pasos

```bash
git clone https://github.com/LautaroFNZ/tp-cine.git
cd tp-cine/cineya
npm install
ng serve
```

La aplicación queda en `http://localhost:4200`.

Las credenciales de Supabase están en `cineya/src/environments/environment.ts` y `environment.development.ts` (`supabaseUrl` y `supabaseAnonKey`). La clave que se usa es la **pública** (publishable / anon), pensada para viajar en el navegador; los datos están protegidos por RLS.

La cámara para leer códigos QR solo funciona con HTTPS (o en `localhost`).

## Base de datos (Supabase)

Toda la estructura está versionada como migraciones SQL en `cineya/supabase/migrations`. Para usar un proyecto de Supabase propio:

```bash
cd cineya
npx supabase login
npx supabase link --project-ref <ID_DEL_PROYECTO>
npx supabase db push
```

- En **Authentication → Sign In / Providers** hay que desactivar *Confirm email*
- Las **películas**, los productos, los combos y los cupones se cargan desde el panel de administración.
- Los **roles** se asignan con SQL. Por defecto todo usuario nuevo es cliente:

```sql
update profiles set role = 'admin' where email = 'correo@ejemplo.com';
update profiles set role = 'empleado' where email = 'otro@ejemplo.com';
```

### Usuarios de prueba

| Rol | Correo | Contraseña | Qué se puede probar |
|---|---|---|---|
| Cliente (mayor de 18 años) | lautaro@pruebas.com | lautaropruebas | Comprar, reseñar, activar alertas, cancelar, Mi cuenta |
| Empleado | empleado@empleado.com | empleado | Panel de empleados: validar entradas y entregar el candy |
| Administrador | admin@admin.com | admintema | Panel de administración |


### Recorrido sugerido para probarla

1. Entrar como **administrador**: cargar o editar una película, programarle funciones (la sala se asigna sola) y revisar precios, combos y cupones.
2. Entrar como **cliente**: elegir butacas de una función (el mapa se actualiza en vivo si hay otra pestaña abierta), sumar un combo, pagar y descargar la entrada en PDF.
3. Entrar como **empleado**: validar la entrada con el código (el mismo día de la función) y entregar el candy. Un segundo intento con el mismo código es rechazado.
4. Volver como cliente: ver el puntaje acumulado, cancelar una compra y comprobar el crédito, y mirar la sección **Estrenos** para activar una alerta.

## Estructura del proyecto

```
tp-cine/
├── README.md
├── docs/                       Documentación de apoyo
└── cineya/                     Aplicación Angular
    ├── supabase/migrations/    Estructura de la base de datos
    └── src/app/
        ├── core/               Compartido por toda la app
        │   ├── models/           Interfaces (Pelicula, Funcion, Butaca, Perfil, Compra, Combo, ...)
        │   ├── services/         SupabaseService, AuthService, CarritoService, PuntosService, ...
        │   └── guards/           guardRol, guardCarrito, guardSalidaCompra
        ├── features/           Una carpeta por parte del negocio
        │   ├── catalog/          Portada (Cartelera y Estrenos), detalle y reseñas
        │   ├── auth/             Login y registro
        │   ├── compra/           Pasos: butacas, candy bar, pago; resumen de compra
        │   ├── promociones/      Cartel del cupón de bienvenida
        │   ├── entrada/          Entrada con QR y PDF
        │   ├── empleado/         Panel de empleados y lector de QR
        │   ├── perfil/           Mi cuenta: detalles, compras, puntos, crédito
        │   └── admin/            Panel de administración
        └── shared/             Reutilizable, sin lógica de negocio
            ├── components/       SelectorImagen, DialogoAviso, MenuPrincipal, AvisoVenta
            ├── directives/       ClickAfuera
            ├── pipes/            filtrarPeliculas, edadMinima, incluyeCombo
            └── utils/            fechas, texto, estrenos, rango-fechas, pdf-entrada, reporte-pdf, reporte-excel
```

## Arquitectura

```
Componente  ->  Servicio  ->  supabase-js  ->  API de Supabase  ->  Postgres (RLS, restricciones, funciones)
    ^                                                                     |
    +----------- signal con el resultado <------ respuesta ---------------+
```

- Los **componentes** solo muestran datos y reaccionan a la interacción. Nunca hablan con la base directamente.
- Los **servicios** encapsulan el acceso a Supabase y la lógica compartida, y se inyectan con la inyección de dependencias de Angular (`@Service()` e `inject()`).
- El **estado de las pantallas** vive en signals; los valores derivados, en `computed`. El estado de la compra en curso vive en un `BehaviorSubject` dentro de `CarritoService`.
- La **lógica crítica** (comprar, programar funciones, calcular precios y descuentos, puntos, crédito, cancelar, validar QR) vive en funciones de la base de datos, para que el navegador no pueda saltearla.

### Rutas

| Ruta | Acceso | Contenido |
|---|---|---|
| `/` | Público | Portada: buscador, Cartelera y Estrenos |
| `/pelicula/:id` | Público | Detalle, reseñas y funciones |
| `/funcion/:id/compra` | Público, con reserva activa | Pasos: butacas, candy bar y pago |
| `/entrada/:codigo` | Público (con el código) | Entrada con QR y PDF |
| `/login`, `/registro` | Público | Formularios |
| `/cuenta` | Usuario con sesión | Detalles, Mis compras, Mis puntos, Mi crédito |
| `/admin` | Administrador | Películas, funciones, precios, candy bar, cupones, fidelización, combos, reportes y salas |
| `/empleado` | Empleado y administrador | Validación de entradas y candy |

Todas las pantallas, salvo la portada, se cargan con *lazy loading*, y las librerías pesadas (QR, PDF y cámara) se cargan recién cuando se usan. El acceso por rol lo resuelve un guard (`guardRol`).

### Base de datos

El listado completo de tablas y funciones está en [`docs/Decisiones_tecnicas_TP_Cine.docx`](docs/Decisiones_tecnicas_TP_Cine.docx). Las principales:

| Tabla | Para qué |
|---|---|
| `profiles` | Datos del usuario y rol (la crea un trigger al registrarse) |
| `movies`, `genres`, `movie_genres`, `reviews` | Catálogo con varios géneros por película, y reseñas |
| `rooms`, `seats`, `showtimes` | Salas, butacas y funciones |
| `purchases`, `tickets`, `purchase_items`, `purchase_combos` | Compras y sus entradas, productos y combos (privadas) |
| `occupied_seats`, `seat_holds` | Ocupación pública y reservas temporales de butacas (Realtime) |
| `products`, `combos`, `coupons`, `rewards` | Candy bar, combos, cupones y recompensas |
| `points_movements`, `credit_movements` | Libros de puntos y de crédito de cada usuario |
| `release_alerts` | Alertas de estreno |

## Decisiones técnicas

Las principales, en resumen (el detalle completo está en [`docs/Decisiones_tecnicas_TP_Cine.docx`](docs/Decisiones_tecnicas_TP_Cine.docx)):

- **Seguridad con RLS.** Todas las tablas tienen Row Level Security. La clave pública está en el navegador por diseño; lo que protege los datos son las políticas. Los roles no se pueden modificar desde la app.
- **Reglas de negocio en la base de datos.** La no superposición de funciones se garantiza con una restricción de exclusión de Postgres, y la doble venta de una butaca con la clave primaria de `occupied_seats`. Ambas valen aunque se saltee la aplicación.
- **Compra atómica.** `complete_purchase` crea la compra, las entradas, los productos y los combos, aplica descuentos, canjes y crédito y suma los puntos en una sola transacción. El precio lo calcula la base de datos, nunca el navegador.
- **Preventa y estrenos.** La venta abre 7 días antes del estreno y lo valida la base en cada reserva; el precio de preventa es una regla aparte, configurable por película.
- **Puntos y crédito como libros de movimientos.** El saldo es la suma de las filas del usuario, y cada usuario ve solo las suyas.
- **Tiempo real.** La ocupación está en su propia tabla pública y mínima, separada de las entradas privadas.
- **Entrada y QR.** El QR contiene solo el código de la compra; su validez se decide siempre en la base (día de la función, no cancelada, no usada).
- **Restricción de edad.** Las películas con clasificación exigen iniciar sesión, porque una compra anónima no permite verificar la edad.
- **Directiva propia:** `appClickAfuera` (de atributo, con `ElementRef` y `HostListener`) cierra los desplegables al hacer clic afuera.
- **Reportes calculados en la base.** Tres funciones que solo responden a un administrador (no cuentan las compras canceladas y el día es el de Argentina). Los gráficos son propios (`ngStyle`) y se exportan a PDF (jsPDF) y a Excel (`write-excel-file`).
- **Confirmación de correo desactivada**, porque el servicio de mails de prueba de Supabase es limitado. En un producto real se configuraría un SMTP propio.
- **Estilo propio** (tema oscuro con acento rojo) sin librería de UI, con las fuentes empaquetadas para que funcionen sin conexión.

## Despliegue

La aplicación se publica en Firebase Hosting como aplicación de una sola página (todas las direcciones se reescriben a `index.html`). Desde `cineya/`:

```bash
ng build
firebase deploy --only hosting
```

La carpeta publicada es `dist/cineya/browser`. Las migraciones de la base se aplican aparte, con `npx supabase db push`.

## PWA

Se agregó con `ng add @angular/pwa`: manifest, íconos y service worker (`ngsw-worker.js`). El service worker solo se activa en el build de producción, no con `ng serve`. En la versión publicada se puede ver activo en las herramientas del navegador (Application → Service Workers) y la app se puede instalar.

## Estado y próximos pasos

**Pendiente de construir:**

- **Registro de actividad del administrador** (quién creó una función, cambió un precio o validó una entrada), que pide el mail del cliente.
- **Top 3 de películas más vendidas** en la portada y la sección **Mis películas**. La base ya tiene la función `get_top_movies`.

**Fuera del alcance:** el mapa de todo el cine con la sala de cada entrada (el propio cliente indicó que no tiene aprobación todavía).

**Limitaciones conocidas:**

- El pago es simulado: no hay una pasarela real ni se guardan datos de tarjeta.
- Si cambia la duración de una película, las funciones ya creadas no se recalculan.
- Hay que programar las funciones de una película antes de que abra su venta; la aplicación no avisa si se olvidan, ni impide programar una función anterior al estreno.
- Las reseñas no exigen haber comprado (la consigna pide que cualquiera pueda calificar).
- Las salas se pueden agregar desde el panel, pero no dar de baja; todas comparten la misma distribución de butacas, como indica el cliente.

## Autor

Lautaro Fernandez — Programación IV.
