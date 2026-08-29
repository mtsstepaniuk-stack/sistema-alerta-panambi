# Publicar el sistema online con GitHub + Render

Esta versión está preparada para ejecutarse como **un solo Web Service** en Render. El mismo servidor Python entrega el frontend y la API, por lo que **no hace falta GitHub Pages**.

## 1. Subir a GitHub

Creá un repositorio nuevo, por ejemplo:

`Sistema-Alerta-Inundaciones-Panambi`

Subí **todo el contenido de esta carpeta** a la raíz del repositorio. En la raíz deben verse, entre otros:

- `index.html`
- `backend/`
- `css/`
- `js/`
- `render.yaml`
- `README.md`

No subas manualmente archivos `.sqlite` ni imágenes generadas dentro de `uploads/incidencias/`.

## 2. Crear el servicio en Render

Opción recomendada: usar el archivo `render.yaml` incluido.

1. Ingresá a Render.
2. Conectá tu cuenta de GitHub.
3. Elegí crear un **Blueprint** desde el repositorio.
4. Render detectará `render.yaml`.
5. Confirmá la creación del Web Service.

La configuración incluida usa:

- Runtime: Python
- Build: `python -m compileall backend`
- Start: `python backend/server.py`
- Health check: `/api/health`
- Plan: Free

## 3. Probar la publicación

Cuando Render termine, te dará una URL similar a:

`https://sat-inundaciones-panambi-g11.onrender.com`

Abrí esa URL. El sistema debe mostrar la pantalla inicial.

También podés probar:

`https://TU-DOMINIO.onrender.com/api/health`

Debe responder JSON con `"ok": true`.

## 4. Datos y SQLite

La base SQLite se crea automáticamente cuando arranca el servidor. Esto permite demostrar el sistema sin configurar una base externa.

**Importante:** en un servicio sin disco persistente, SQLite y los archivos subidos pueden reiniciarse cuando el servicio se recrea o redespliega. Para una entrega/demo esto puede ser suficiente. Para conservar datos de forma permanente hay dos caminos:

- montar almacenamiento persistente y configurar `SAT_DATA_DIR` / `SAT_UPLOAD_DIR`; o
- migrar posteriormente la base a PostgreSQL.

## 5. Actualizaciones

Una vez conectado el repositorio, cada cambio que subas a la rama desplegada puede volver a desplegarse en Render. Así el enlace público queda actualizado con la última versión del proyecto.

## 6. Si el nombre del servicio ya existe

Podés cambiar en `render.yaml`:

```yaml
name: sat-inundaciones-panambi-g11
```

por otro nombre, por ejemplo:

```yaml
name: sat-inundaciones-panambi-grupo11
```

Luego volvé a crear/sincronizar el Blueprint.
