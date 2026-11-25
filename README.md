# Cifra 💜

**Cifra** es una aplicación web de gestión financiera personal, diseñada para ayudar a organizar ingresos, gastos y cuentas por pagar desde un solo lugar.

El proyecto busca ofrecer una experiencia sencilla e intuitiva, permitiendo llevar un registro de la actividad financiera, administrar pagos y mantener un mayor control sobre el dinero.

## ✨ Funcionalidades

- **Panel financiero:** visualización resumida de ingresos, gastos y saldo.
- **Movimientos:** registro, edición y eliminación de ingresos y gastos.
- **Cuentas por pagar:** administración de cuentas pendientes y pagadas.
- **Pagos:** registro automático del movimiento asociado al marcar una cuenta como pagada.
- **Recurrencias:** creación y administración de cuentas recurrentes, con generación automática de vencimientos.
- **Comprobantes:** posibilidad de adjuntar imágenes o documentos PDF a movimientos y cuentas pagadas.
- **Historial:** consulta y administración de cuentas pagadas.
- **Autenticación:** acceso mediante correo electrónico y contraseña.
- **PWA:** posibilidad de instalar la aplicación como una aplicación web progresiva.

## 🛠️ Tecnologías utilizadas

| Tecnología | Uso |
|---|---|
| HTML5 | Estructura de la aplicación |
| CSS3 | Diseño y estilos |
| JavaScript | Lógica e interactividad |
| Vite | Entorno de desarrollo y compilación |
| Supabase | Base de datos, autenticación y almacenamiento |
| PostgreSQL | Gestión de datos |
| Vite PWA | Funcionalidades de aplicación web progresiva |
| Lucide | Iconografía |
| Vercel | Despliegue de la aplicación |

## 📁 Estructura del proyecto

```text
Cifra/
├── public/
│   ├── cifra-icon.png
│   ├── cifra.ico
│   ├── manifest.webmanifest
│   ├── pwa-192x192.png
│   └── pwa-512x512.png
├── src/
│   ├── features/
│   │   ├── bills.js
│   │   ├── movements.js
│   │   └── recurrences.js
│   ├── lib/
│   │   └── supabase.js
│   ├── services/
│   │   └── recurrences.js
│   ├── styles/
│   │   ├── app.css
│   │   ├── base.css
│   │   └── tokens.css
│   ├── ui/
│   │   ├── dashboard.js
│   │   ├── login.js
│   │   └── notifications.js
│   ├── utils/
│   │   ├── financial.js
│   │   ├── formatters.js
│   │   └── icons.js
│   └── main.js
├── index.html
├── package.json
├── vite.config.js
└── README.md
```

## 🚀 Instalación y ejecución local

### Requisitos

- [Node.js](https://nodejs.org/)
- npm
- Una cuenta de [Supabase](https://supabase.com/)

### 1. Clonar el repositorio

```bash
git clone https://github.com/fromnicole/Cifra.git
cd Cifra
```

### 2. Instalar dependencias

```bash
npm install
```

### 3. Configurar variables de entorno

Crear un archivo `.env` en la raíz del proyecto:

```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_PUBLISHABLE_KEY=tu_clave_publicable
```

Estos valores se obtienen desde la configuración del proyecto en Supabase.

**Importante:** no compartas credenciales privadas ni subas archivos `.env` al repositorio.

### 4. Iniciar la aplicación

```bash
npm run dev
```

Vite iniciará el servidor de desarrollo. Normalmente podrás acceder desde:

```text
http://localhost:5173
```

## 🗄️ Configuración de Supabase

Cifra utiliza Supabase para gestionar los usuarios, almacenar la información financiera y guardar los comprobantes adjuntos.

Para ejecutar el proyecto con una instancia propia, es necesario configurar lo siguiente:

### 1. Base de datos

Crear las siguientes tablas en el esquema `public`:

| Tabla | Descripción |
|---|---|
| `movements` | Almacena ingresos y gastos. |
| `bills` | Almacena las cuentas por pagar y su estado de pago. |
| `bill_recurrences` | Almacena las configuraciones de cuentas recurrentes. |

Las tablas utilizan identificadores UUID y relaciones con los usuarios de Supabase Auth.

También se requieren las restricciones, índices y relaciones entre cuentas, movimientos y recurrencias para mantener la integridad de los datos.

### 2. Seguridad

Las tres tablas utilizan **Row Level Security (RLS)** para proteger la información de cada usuario.

Las políticas permiten que cada usuario consulte, registre, actualice y elimine únicamente sus propios registros.

Además, se utilizan funciones RPC para realizar operaciones como:

- `pay_bill`: registra el pago de una cuenta y genera su movimiento asociado.
- `unpay_bill`: revierte un pago y elimina el movimiento asociado.
- `delete_pending_bill`: elimina una cuenta pendiente.
- `delete_paid_bill`: elimina una cuenta pagada y su movimiento asociado.
- `delete_paid_bill_history`: elimina el historial de cuentas pagadas del usuario.

Estas funciones requieren autenticación y verifican la identidad del usuario antes de realizar operaciones.

### 3. Autenticación

En Supabase, habilitar el proveedor **Email** desde Authentication → Sign In / Providers.

Cifra utiliza confirmación de correo electrónico, por lo que también debe configurarse este comportamiento en el proyecto.

En Authentication → URL Configuration, configurar:

- **Site URL:** dirección principal de la aplicación.
- **Redirect URLs:** direcciones autorizadas para los procesos de autenticación.

Por ejemplo:

```text
http://localhost:5173/**
https://tu-dominio.vercel.app/**
```

Reemplazar el dominio de ejemplo por la dirección correspondiente a la instalación.

### 4. Almacenamiento de comprobantes

Crear un bucket privado llamado:

```text
receipt-attachments
```

Configuración:

| Propiedad | Valor |
|---|---|
| Acceso público | Desactivado |
| Tamaño máximo | 10 MB |
| Formatos permitidos | JPG, PNG, WEBP y PDF |

Los archivos se organizan por usuario y tipo de registro:

```text
receipt-attachments/
├── ID_USUARIO/
│   ├── bills/
│   └── movements/
```

Las políticas de Storage restringen el acceso a los archivos de cada usuario autenticado.

Los comprobantes se visualizan mediante enlaces firmados temporales, sin necesidad de hacer público el bucket.

## ☁️ Despliegue en Vercel

Cifra utiliza Vercel para alojar la aplicación web y Supabase para gestionar los datos y la autenticación.

Para desplegar el proyecto:

1. Importar el repositorio de GitHub en Vercel.
2. Seleccionar Vite como framework.
3. Configurar los siguientes parámetros:

| Configuración | Valor |
|---|---|
| Framework | Vite |
| Root Directory | `./` |
| Install Command | `npm install` |
| Build Command | `npm run build` |
| Output Directory | `dist` |

4. Agregar las variables de entorno:

```env
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_PUBLISHABLE_KEY=tu_clave_publicable
```

5. Realizar el despliegue.
6. Agregar el dominio generado por Vercel a las URL de redirección permitidas en Supabase.

## 📦 Compilación

Para generar la versión de producción:

```bash
npm run build
```

Para probar la compilación localmente:

```bash
npm run preview
```

Los archivos finales se generan en la carpeta `dist/`.
