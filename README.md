# Sistema de Alerta Temprana de Inundaciones — Panambí

Aplicación web del Grupo 11 para Ingeniería de Software I. Incluye frontend HTML/CSS/JavaScript y backend en Python con persistencia SQLite.

## Funcionalidades de esta versión

- Login de operadores autorizados.
- Panel principal de Defensa Civil.
- Simulación de sensores y visualización del nivel del río.
- Alertas automáticas y alertas manuales.
- Validación y rechazo de alertas.
- Reporte público de incidencias vecinales.
- Imagen opcional en incidencias.
- Gestión de contactos.
- Administración de usuarios.
- Historial de eventos.
- Mapa de Panambí con OpenStreetMap/Leaflet.
- Backend y frontend servidos desde el mismo dominio.

> Nota académica: los sensores y los servicios externos de mensajería siguen siendo simulados en esta versión del prototipo.

## Ejecutar localmente

Requiere Python 3.

```bash
python backend/server.py
```

Después abrir:

```text
http://localhost:3000
```

También se puede usar:

```bash
npm start
```

El `package.json` solamente llama al servidor Python; no hay dependencias Node necesarias para ejecutar el sistema.

## Usuarios de prueba

### Defensa Civil

```text
Usuario: dcivil.panambi
Contraseña: admin123
```

### Administrador

```text
Usuario: admin
Contraseña: admin
```

Estas credenciales son únicamente datos de demostración del prototipo.

## Base de datos

La base se crea automáticamente al iniciar el servidor:

```text
backend/database/sat_inundaciones.sqlite
```

La base generada no se versiona en Git. Si el archivo no existe, el backend crea las tablas y carga datos iniciales.

Tablas principales:

- `usuarios`
- `contactos`
- `mediciones`
- `alertas`
- `incidencias`
- `historial`

## API principal

```text
GET    /api/health
POST   /api/auth/login
GET    /api/dashboard
GET    /api/usuarios
POST   /api/usuarios
DELETE /api/usuarios/:id
GET    /api/contactos
GET    /api/contactos/destinatarios?zona=Ribera%20Norte
POST   /api/contactos
PUT    /api/contactos/:id
DELETE /api/contactos/:id
GET    /api/historial
GET    /api/alertas?estado=Pendiente
POST   /api/incidencias
POST   /api/alertas/manuales
POST   /api/alertas/accion
```

## Publicación online

El proyecto incluye `render.yaml` para publicarlo como Web Service en Render desde un repositorio de GitHub.

Guía paso a paso:

**[DEPLOY_RENDER.md](DEPLOY_RENDER.md)**

La configuración de Render es:

```text
Build Command: python -m compileall backend
Start Command: python backend/server.py
Health Check: /api/health
```

Render define la variable `PORT` automáticamente y el backend ya la utiliza.

## Persistencia en hosting

Por defecto se usa SQLite dentro del filesystem del servicio. Se pueden redirigir los datos mediante:

```text
SAT_DATA_DIR
SAT_UPLOAD_DIR
```

Esto permite apuntar a un almacenamiento persistente sin cambiar el código. Para una versión de producción también es recomendable migrar la persistencia a PostgreSQL y reforzar autenticación/autorización del backend.

## Estructura

```text
.
├── backend/
│   ├── database/
│   └── server.py
├── css/
├── js/
├── uploads/
│   └── incidencias/
├── index.html
├── render.yaml
├── requirements.txt
├── package.json
└── DEPLOY_RENDER.md
```
