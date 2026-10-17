# Cifra

Aplicación web de finanzas personales para organizar movimientos, cuentas, pagos y gastos recurrentes desde un mismo lugar.

**Aplicación publicada:** [cifra-dusky-mu.vercel.app](https://cifra-dusky-mu.vercel.app)

## Funcionalidades

- **Panel principal:** vista de resumen y acceso a las áreas de la aplicación.
- **Movimientos:** registro y consulta de ingresos y gastos, con filtros de búsqueda.
- **Cuentas:** creación y gestión de cuentas asociadas a los movimientos.
- **Cuentas pendientes y pagos:** registro y seguimiento de cuentas por pagar.
- **Recurrencias:** configuración de pagos recurrentes y generación de las cuentas correspondientes.
- **Comprobantes:** visualización de comprobantes asociados a los registros cuando están disponibles.
- **Autenticación:** inicio y cierre de sesión, recuperación de contraseña y eliminación de cuenta.
- **PWA:** instalación como aplicación en dispositivos compatibles mediante el manifest y el service worker generados durante la compilación.

## Tecnologías

- JavaScript con módulos ES.
- Vite para desarrollo y compilación.
- Supabase JS para conectarse con Supabase.
- `vite-plugin-pwa` y Workbox para el manifest y el service worker.
- HTML y CSS, con estilos organizados en tokens, estilos base y estilos de la aplicación.
- Lucide para iconos y Google Fonts para las tipografías Fraunces y Work Sans.

## Requisitos

- Node.js y npm.
- Un proyecto de Supabase configurado para la aplicación.

## Instalación y desarrollo

Clona el repositorio desde GitHub y abre una terminal en la carpeta local `cifra`. Instala las dependencias:

```bash
npm ci
```

Crea un archivo `.env` en la raíz del proyecto con las variables requeridas por el cliente de Supabase:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Usa los valores de tu propio proyecto Supabase. No compartas ni publiques archivos `.env`. La aplicación cliente debe usar la clave publicable; las claves `secret` y `service_role` no deben incluirse en el frontend.

Inicia el servidor local:

```bash
npm run dev
```

## Compilación

Genera la versión de producción:

```bash
npm run build
```

Previsualiza localmente el resultado compilado:

```bash
npm run preview
```

Vite escribe la compilación en `dist/`. Esa carpeta se genera de nuevo al compilar y no se mantiene como código fuente.

## Estructura del proyecto

```text
.
├── public/                 # Manifest e iconos estáticos
├── src/
│   ├── features/           # Funcionalidades de movimientos, cuentas y recurrencias
│   ├── lib/                # Cliente de Supabase
│   ├── services/           # Operaciones de recurrencias
│   ├── styles/             # Tokens, estilos base y estilos de la aplicación
│   ├── ui/                 # Login, dashboard y notificaciones
│   ├── utils/              # Formatos financieros, fechas, texto e iconos
│   └── main.js             # Punto de entrada e inicialización
├── index.html              # Documento HTML de entrada
├── package.json            # Scripts y dependencias
├── package-lock.json       # Versiones instaladas de dependencias
└── vite.config.js          # Configuración de Vite y PWA
```

## PWA y despliegue

Los iconos y `manifest.webmanifest` se mantienen en `public/`. Vite los copia a `dist/` al compilar. `vite-plugin-pwa` genera el service worker durante el build y está configurado para actualizarlo automáticamente.

La aplicación está desplegada en Vercel. Para publicar desde la carpeta local vinculada al proyecto:

```bash
vercel
```

Ese comando crea un despliegue Preview una vez que existe un despliegue de producción. Para publicar una versión nueva en producción:

```bash
vercel --prod
```

Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en las variables de entorno del proyecto de Vercel para los entornos correspondientes. Supabase también debe permitir el dominio de producción en **Authentication → URL Configuration** para que los flujos de correo vuelvan a la aplicación.

## Pruebas y licencia

`package.json` no define actualmente un script de pruebas automatizadas. La compilación se puede comprobar con `npm run build`.

El repositorio no incluye un archivo de licencia. Añade una licencia explícita si deseas definir permisos de reutilización, modificación o distribución del código.
