# UTP Cover

A UTP cover-page generator built with React, TypeScript, Tailwind CSS, and a FastAPI backend. ReportLab produces the PDF, while the SVG preview uses the exact same drawing, positions, and font metrics. Preview glyphs are converted to paths so Calibri renders consistently on devices where it is not installed; generated PDFs keep selectable text.

## Run with Docker

Requirements:

- Docker Desktop with Linux containers enabled.
- Licensed copies of `calibri.ttf` and `calibrib.ttf`. Windows already includes them in `C:\Windows\Fonts`.

On Windows, the default Compose configuration mounts the system Fonts directory automatically:

```powershell
docker compose up --build -d
docker compose ps
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). View logs or stop the application with:

```powershell
docker compose logs -f app
docker compose down
```

Cover data is stored in the `utp-caratula_cover-data` Docker volume and survives container replacement. `docker compose down` preserves it; `docker compose down --volumes` permanently removes it.

### Custom font path or port

Copy `.env.example` to `.env` and change the values when Calibri is stored elsewhere or port 8000 is unavailable:

```dotenv
CALIBRI_FONT_DIR=D:/licensed-fonts
PORT=8080
```

On Linux or macOS, `CALIBRI_FONT_DIR` must point to a host directory containing legally obtained copies of both required font files. The fonts are mounted at runtime and are never copied into the image.

### Run without Compose

```powershell
docker build -t utp-cover .
docker volume create utp-cover-data
docker run --name utp-cover --rm -p 8000:8000 -v "C:/Windows/Fonts:/fonts:ro" -v utp-cover-data:/app/data utp-cover
```

The runtime image runs as an unprivileged user, contains only Python and the compiled frontend, exposes port 8000, and includes a health check against `/api/health`.

## Run locally on Windows

Requirements: Node.js 20.19+ or 22.12+, Python 3.12+, and Calibri installed.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
npm.cmd install
npm.cmd run build
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). After installing the dependencies, `iniciar.ps1` can also compile and start the application.

## Development

Start FastAPI with automatic reload in one terminal:

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

Start Vite in another terminal:

```powershell
npm.cmd run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173). Vite proxies `/api` to FastAPI, so no CORS configuration or API keys are required. Interactive API documentation is available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

## Features

- Every field is optional; empty values do not leave labels or separators behind.
- Dynamic student rows with optional codes and automatic singular/plural labels. Up to 30 rows are accepted, subject to the actual available page space.
- Drag-and-drop student ordering, keyboard reordering with the arrow keys, and automatic sorting by surname.
- Free-form course names and quick city suggestions.
- A fixed UTP identity with the official institution name and SVG logo.
- Embedded Calibri 11, 2.54 cm margins, and double line spacing within content blocks. Space between blocks adjusts automatically; text is never silently shrunk or clipped.
- Automatically refreshed previews and browser-persistent zoom. Obsolete requests are cancelled while the user continues typing. Overflow prevents invalid downloads.
- Vector PDFs with selectable text and a vector logo.
- Editable DOCX output using the same cover layout.
- Account-free local history. Each cover has a stable ID and is automatically saved to SQLite after a short editing pause.
- Accent- and case-insensitive search across every field, including hidden student codes.
- Saved covers can be reopened for further editing or downloaded again.
- Shareable links open an automatically saved cover. On localhost, links work on the same machine while the same database is available.

## API

- `GET /api/health`: verify the renderer, logo, and fonts.
- `POST /api/preview`: render JSON input as SVG.
- `POST /api/docx`: generate an editable Word cover.
- `POST /api/pdf`: generate the same cover as a downloadable PDF.
- `POST /api/covers`: create a cover with a stable ID.
- `PUT /api/covers/{id}`: update an existing cover and its PDF.
- `GET /api/covers?q=text&limit=20&offset=0`: search and paginate history.
- `GET /api/covers/{id}`: retrieve saved form data.
- `DELETE /api/covers/{id}`: delete an owned cover.
- `GET /api/covers/{id}/pdf`: download the exact stored PDF.
- `GET /api/covers/{id}/docx`: generate an editable Word file from saved data using the current template.

Every field has a length limit. Invalid requests and content that cannot fit on one page return HTTP 422. Missing Calibri files return HTTP 503 with configuration guidance. User text is always treated as plain text and is never interpreted as HTML or SVG markup.

```json
{
  "template": "utp",
  "course": "Current Issues and Challenges in Peru",
  "week": "4",
  "title": "Essay on Leguía's Eleven-Year Rule",
  "subtitle": "Was Leguía's government authoritarian?",
  "teacher": "",
  "members": [{"name": "Surname, given names", "code": ""}],
  "city": "Lima",
  "year": "2026",
  "show_codes": true,
  "show_logo": true
}
```

## Tests

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest tests -q
npm.cmd run build
```

The suite verifies A4 dimensions, embedded fonts, single-page output, accented text, empty fields, hidden codes, student labels, safe SVG output, SVG/PDF consistency, fixed UTP identity, long-word wrapping, overflow rejection, storage, search, ownership, and editable Word output.

## Architecture

The backend separates HTTP transport (`main.py`), validation (`models.py`), shared contracts (`contracts.py`), layout composition (`layout.py`), application use cases (`services.py`), and SQLite persistence (`storage.py`). `CoverService` depends on a repository protocol and receives its implementations through its constructor, so storage and layout strategies can be replaced without changing route handlers.

On the frontend, `cover.ts` contains pure transformations between editor state and API data, while `api.ts` owns the typed HTTP contract. `components/` separates fields, tabs, students, history, and preview controls through explicit prop interfaces. `hooks/` owns effects with independent lifecycles, and `main.tsx` acts as the composition root and use-case coordinator.

The multi-stage Docker build compiles the frontend separately and copies only the static output into the Python runtime image. FastAPI serves both the API and the compiled application from one process.

## Deployment notes

The application requires a Python server and persistent storage. For an internet-facing deployment, place it behind an HTTPS reverse proxy, configure request-rate limits, and back up `/app/data` regularly.

Set `CALIBRI_FONT_DIR` to a directory containing licensed `calibri.ttf` and `calibrib.ttf` files when running without Docker. The project does not redistribute font files and intentionally fails instead of silently substituting another typeface.

## Local data

Without Docker, the database is created at `data/caratulas.sqlite3`, which is excluded from Git. With Docker Compose, it is stored in the `cover-data` named volume. The browser stores a temporary user identifier, the active cover ID, and zoom preferences in `localStorage`; no account or external service is used.

The stored PDF remains unchanged so it can be downloaded exactly as generated. DOCX files are regenerated from saved form data using the current layout and include a high-resolution PNG logo for compatibility with Word.
