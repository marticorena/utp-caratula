# UTP Carátula

Generador de carátulas para trabajos de la UTP, hecho con React, TypeScript y
FastAPI. Permite editar los datos, ver el resultado y descargarlo en PDF o Word.

- Papel Carta o A4, márgenes de 2.54 cm y texto a doble espacio.
- Calibri 11, Arial 11, Times New Roman 12 o Georgia 11.
- Integrantes ordenables, historial con búsqueda y enlaces para compartir.
- SQLite en local y PostgreSQL (Neon) en producción.

## Ejecutar con Docker (Windows)

Requiere Docker Desktop con contenedores Linux.

```powershell
docker compose up --build --watch
```

Abre [localhost:8000](http://localhost:8000). Los cambios reconstruyen la app
mientras la terminal esté abierta. También puedes usar `./iniciar-docker.ps1`.

```powershell
docker compose logs -f app  # Ver logs
docker compose down         # Detener
```

## Ejecutar sin Docker (Windows)

Requiere Python 3.12+ y Node.js 22.12+.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm.cmd ci
npm.cmd run build
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Abre [localhost:8000](http://localhost:8000).

Para desarrollar, ejecuta el backend con `--reload` y `npm.cmd run dev` en otra
terminal. Vite estará en [localhost:5173](http://localhost:5173).

## Despliegue en Render + Neon

Crea una base de datos en Neon y un **Web Service** en Render conectado a este
repositorio: rama `main`, entorno Docker, `./Dockerfile` y plan Free.

Configura estas variables en Render:

```dotenv
DATABASE_URL=<URL de conexión de Neon con sslmode=require>
REQUIRE_DATABASE_URL=1
FONT_MODE=native
```

Usa `/api/health` para el health check y activa **Auto-Deploy: On Commit**.
Cada push a `main` actualizará la app. `render.yaml` incluye la configuración.

Las fuentes originales están en `fonts/` y se incluyen en Docker; conservan sus
licencias propietarias. El historial local se guarda en `data/caratulas.sqlite3`
o en el volumen de Docker; en Render se guarda en Neon.

## Comprobaciones

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
npm.cmd run build
```

GitHub Actions comprueba frontend, backend y Docker en cada push a `main`.
La documentación de la API está en [localhost:8000/docs](http://localhost:8000/docs).
