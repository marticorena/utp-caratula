"""FastAPI transport layer for the UTP cover application."""

from collections.abc import Callable
from pathlib import Path
import sqlite3
from typing import Any, TypeVar

from fastapi import FastAPI, Header, HTTPException, Query, Response
from fastapi.staticfiles import StaticFiles

from backend.layout import (
    CoverLayoutEngine,
    build_drawing,
    logo,
    setup_fonts,
    wrap,
)
from backend.models import Cover, Member
from backend.services import CoverService, DefaultCoverRepository

ROOT = Path(__file__).resolve().parent.parent
DOCX_MIME = (
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
)
PDF_HEADERS = {
    "Content-Disposition": 'attachment; filename="caratula.pdf"',
    "Cache-Control": "no-store",
}
DOCX_HEADERS = {
    "Content-Disposition": 'attachment; filename="caratula.docx"',
    "Cache-Control": "no-store",
}
T = TypeVar("T")

app = FastAPI(title="Carátula API", version="1.0.0")
cover_service = CoverService(DefaultCoverRepository(), CoverLayoutEngine())


@app.middleware("http")
async def fresh_frontend(request: Any, call_next: Callable[..., Any]) -> Response:
    """Prevent stale HTML while allowing normal asset caching."""
    response = await call_next(request)
    if "text/html" in response.headers.get("content-type", ""):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health() -> dict[str, str]:
    """Report whether rendering dependencies are available."""
    try:
        setup_fonts()
        logo()
    except (RuntimeError, OSError) as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"status": "ok", "font": "Calibri", "page": "A4"}


def generation_or_error(operation: Callable[[], T]) -> T:
    """Translate rendering failures to stable HTTP responses.

    Args:
        operation: Deferred rendering operation.

    Returns:
        The rendering result.

    Raises:
        HTTPException: For invalid layout or unavailable dependencies.
    """
    try:
        return operation()
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except (RuntimeError, OSError) as exc:
        raise HTTPException(503, str(exc)) from exc


def drawing_or_error(data: Cover) -> Any:
    """Build a drawing while preserving the legacy helper API."""
    return generation_or_error(lambda: cover_service.drawing(data))


@app.post("/api/preview")
def preview(data: Cover) -> Response:
    """Render a font-independent SVG preview."""
    content = generation_or_error(lambda: cover_service.preview(data))
    return Response(
        content,
        media_type="image/svg+xml",
        headers={"Cache-Control": "no-store"},
    )


@app.post("/api/pdf")
def pdf(data: Cover) -> Response:
    """Render a downloadable PDF."""
    content = generation_or_error(lambda: cover_service.pdf(data))
    return Response(content, media_type="application/pdf", headers=PDF_HEADERS)


@app.post("/api/docx")
def word(data: Cover) -> Response:
    """Render a downloadable editable Word document."""
    content = generation_or_error(lambda: cover_service.docx(data))
    return Response(content, media_type=DOCX_MIME, headers=DOCX_HEADERS)


def create_cover(data: Cover, _content: bytes | None, user_id: str) -> dict[str, Any]:
    """Create a saved cover while preserving the legacy helper signature."""
    try:
        return cover_service.create(data, user_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(
            503,
            "No se pudo guardar la carátula en este equipo. Comprueba el "
            "espacio disponible y vuelve a intentar.",
        ) from exc


@app.post("/api/covers")
def create_saved(
    data: Cover,
    x_user_id: str = Header("legacy", max_length=100),
) -> dict[str, Any]:
    """Create a cover in the current browser history."""
    return create_cover(data, None, x_user_id)


@app.put("/api/covers/{cover_id}")
def update_saved(
    cover_id: str,
    data: Cover,
    x_user_id: str = Header("legacy", max_length=100),
) -> dict[str, Any]:
    """Update a cover owned by the current browser."""
    try:
        result = cover_service.update(cover_id, data, x_user_id)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(
            503,
            "No se pudo guardar la carátula en este equipo. Comprueba el "
            "espacio disponible y vuelve a intentar.",
        ) from exc
    if result is None:
        raise HTTPException(
            404,
            "No se encontró esta carátula para el usuario actual.",
        )
    return result


@app.get("/api/covers")
def history(
    q: str = Query("", max_length=350),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    x_user_id: str = Header("legacy", max_length=100),
) -> dict[str, Any]:
    """Return a paginated history for the current browser."""
    try:
        return cover_service.list(q, limit, offset, x_user_id)
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(
            503,
            "No se pudieron leer tus carátulas guardadas. Vuelve a intentar.",
        ) from exc


def saved_or_error(cover_id: str) -> dict[str, Any]:
    """Load a saved cover or translate repository failures to HTTP errors."""
    try:
        result = cover_service.get(cover_id)
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(
            503,
            "No se pudo abrir la carátula guardada. Vuelve a intentar.",
        ) from exc
    if result is None:
        raise HTTPException(404, "No se encontró esta carátula.")
    return result


@app.get("/api/covers/{cover_id}")
def saved_data(
    cover_id: str,
    x_user_id: str = Header("legacy", max_length=100),
) -> dict[str, Any]:
    """Return public saved data and ownership information."""
    result = saved_or_error(cover_id)
    public = {
        key: value
        for key, value in result.items()
        if key not in {"pdf", "user_id"}
    }
    public["owned"] = result["user_id"] == x_user_id
    return public


@app.delete("/api/covers/{cover_id}", status_code=204)
def delete_saved(
    cover_id: str,
    x_user_id: str = Header("legacy", max_length=100),
) -> Response:
    """Delete a cover owned by the current browser."""
    try:
        deleted = cover_service.delete(cover_id, x_user_id)
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(
            503,
            "No se pudo eliminar la carátula. Vuelve a intentar.",
        ) from exc
    if not deleted:
        raise HTTPException(404, "No se encontró esta carátula.")
    return Response(status_code=204)


@app.get("/api/covers/{cover_id}/pdf")
def saved_pdf(cover_id: str) -> Response:
    """Download the exact PDF stored with a cover."""
    return Response(
        saved_or_error(cover_id)["pdf"],
        media_type="application/pdf",
        headers=PDF_HEADERS,
    )


@app.get("/api/covers/{cover_id}/docx")
def saved_word(cover_id: str) -> Response:
    """Regenerate an editable Word file from saved cover data."""
    data = Cover.model_validate(saved_or_error(cover_id)["data"])
    content = generation_or_error(lambda: cover_service.docx(data))
    return Response(content, media_type=DOCX_MIME, headers=DOCX_HEADERS)


if (ROOT / "dist").is_dir():
    app.mount(
        "/",
        StaticFiles(directory=ROOT / "dist", html=True),
        name="frontend",
    )
