"""One layout engine for the SVG preview and the downloadable vector PDF."""
from copy import deepcopy
from functools import lru_cache
import os
from pathlib import Path
import re
from typing import Annotated, Literal

from fastapi import FastAPI, Header, HTTPException, Response, Query
import sqlite3
from backend import storage
from backend.word import build_docx
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator
from reportlab.graphics import renderPDF, renderSVG
from reportlab.graphics.shapes import Drawing, String
from reportlab.graphics.utils import text2Path
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from svglib.svglib import svg2rlg

ROOT = Path(__file__).resolve().parent.parent
Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=350)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class Member(BaseModel):
    model_config = ConfigDict(extra="forbid")
    name: Annotated[str, StringConstraints(strip_whitespace=True, max_length=245)] = ""
    code: Annotated[str, StringConstraints(strip_whitespace=True, max_length=30)] = ""


class Cover(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_identity(cls, value):
        # Older open tabs still submit the removed template/institution controls.
        # Accept their work while enforcing the current UTP-only identity.
        if isinstance(value, dict):
            return {**{k: v for k, v in value.items() if k != "date"}, "template": "utp", "institution": "Universidad Tecnológica del Perú", "show_logo": True}
        return value

    template: Literal["utp"] = "utp"
    course: Text = ""
    week: ShortText = ""
    title: Text = ""
    subtitle: Text = ""
    teacher: ShortText = ""
    city: ShortText = ""
    year: Annotated[str, StringConstraints(strip_whitespace=True, max_length=10)] = ""
    institution: Literal["Universidad Tecnológica del Perú"] = "Universidad Tecnológica del Perú"
    faculty: Text = ""
    members: list[Member] = Field(default_factory=list, max_length=30)
    show_codes: bool = True
    show_logo: Literal[True] = True


@lru_cache
def setup_fonts():
    font_dir = Path(os.environ.get("CALIBRI_FONT_DIR", "C:/Windows/Fonts"))
    for name, file in [("Calibri", "calibri.ttf"), ("Calibri-Bold", "calibrib.ttf")]:
        path = font_dir / file
        if not path.is_file():
            raise RuntimeError("No se encontró Calibri. Configura CALIBRI_FONT_DIR con calibri.ttf y calibrib.ttf.")
        pdfmetrics.registerFont(TTFont(name, str(path)))


@lru_cache
def logo():
    return svg2rlg(str(ROOT / "public" / "logo.svg"))


def clean(value: str) -> str:
    # Collapse line breaks/control characters; user strings are never interpreted as markup.
    return " ".join(re.sub(r"[\x00-\x1f\x7f]", " ", value).split())


def format_week(value: str) -> str:
    value = clean(value)
    legacy = re.fullmatch(r"semana\s*(\d+)", value, re.IGNORECASE)
    if legacy:
        return f"Semana {legacy.group(1)}"
    return f"Semana {value}" if value.isdigit() else value


def wrap(value: str, bold=False) -> list[str]:
    value = clean(value)
    font = "Calibri-Bold" if bold else "Calibri"
    width = A4[0] - 144
    lines: list[str] = []
    line = ""
    for word in value.split():
        if line and pdfmetrics.stringWidth(f"{line} {word}", font, 11) > width:
            lines.append(line)
            line = ""
        # A pasted URL or uninterrupted string must wrap within the margins as well.
        for char in word:
            candidate = line + char
            if pdfmetrics.stringWidth(candidate, font, 11) > width:
                lines.append(line)
                line = char
            else:
                line = candidate
        line += " "
    if line.strip():
        lines.append(line.strip())
    return [line.strip() for line in lines]


def build_drawing(data: Cover) -> Drawing:
    setup_fonts()
    width, height = A4
    drawing = Drawing(width, height)
    blocks: list[list[tuple[str, bool]]] = []

    def block(*entries: tuple[str, bool]):
        lines = [(line, bold) for value, bold in entries for line in wrap(value, bold)]
        if lines:
            blocks.append(lines)

    members = [m for m in data.members if clean(m.name) or (data.show_codes and clean(m.code))]
    # Keep related lines together; the free vertical space between the fixed
    # header and footer is distributed evenly around these blocks below.
    block((format_week(data.week), False), (data.title, True), (data.subtitle, False))
    if clean(data.course):
        block(("Asignatura:", True), (data.course, False))
    if clean(data.teacher):
        block(("Docente:", True), (data.teacher, False))
    if members:
        names = [" - ".join(filter(None, [clean(m.name), clean(m.code) if data.show_codes else ""])) for m in members]
        block(("Estudiante:" if len(members) == 1 else "Estudiantes:", True), *[(n, False) for n in names])
    block((" - ".join(filter(None, [clean(data.city), clean(data.year)])), False))
    start = 72.0
    if data.show_logo:
        mark = deepcopy(logo())
        scale = 275 / mark.width
        mark.scale(scale, scale)
        mark_height = mark.height * scale
        mark.translate((width - 275) / 2 / scale, (height - 72 - mark_height) / scale)
        drawing.add(mark)
        start += mark_height + 38
    line_height = 18
    # The university belongs to the fixed header, not the centered work details.
    for value, bold in [(data.institution.upper(), True), (data.faculty, False)]:
        for text in wrap(value, bold):
            drawing.add(String(width / 2, height - start - 11, text,
                               fontName="Calibri-Bold" if bold else "Calibri",
                               fontSize=11, textAnchor="middle"))
            start += line_height
    total = sum(len(b) * line_height for b in blocks)
    available = height - 72 - start
    free_space = available - total
    if free_space < 0:
        raise ValueError("El contenido supera una página A4. Acorta el texto o quita algunos datos para mantener Calibri 11 y los márgenes.")
    # Use one equal slot above, below and between every visible block. This
    # avoids accumulating short covers at the top while remaining predictable
    # when optional blocks appear or disappear.
    block_gap = free_space / (len(blocks) + 1) if blocks else 0
    header_gap = block_gap
    y = height - start - header_gap - 11
    for lines in blocks:
        for text, bold in lines:
            drawing.add(String(width / 2, y, text, fontName="Calibri-Bold" if bold else "Calibri", fontSize=11, textAnchor="middle"))
            y -= line_height
        y -= block_gap
    return drawing


app = FastAPI(title="Carátula API", version="1.0.0")


@app.middleware("http")
async def fresh_frontend(request, call_next):
    response = await call_next(request)
    if "text/html" in response.headers.get("content-type", ""):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/api/health")
def health():
    try:
        setup_fonts()
        logo()
    except (RuntimeError, OSError) as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"status": "ok", "font": "Calibri", "page": "A4"}


def drawing_or_error(data: Cover):
    try:
        return build_drawing(data)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except (RuntimeError, OSError) as exc:
        raise HTTPException(503, str(exc)) from exc


@app.post("/api/preview")
def preview(data: Cover):
    drawing = drawing_or_error(data)
    # Outline preview glyphs so every device sees the actual server-side Calibri,
    # including bold. The PDF keeps searchable text with embedded font subsets.
    drawing.contents = [
        text2Path(item.text, x=item.x, y=item.y, fontName=item.fontName,
                  fontSize=item.fontSize, anchor=item.textAnchor,
                  fillColor=item.fillColor, strokeColor=None)
        if isinstance(item, String) else item for item in drawing.contents
    ]
    svg = renderSVG.drawToString(drawing)
    return Response(svg, media_type="image/svg+xml", headers={"Cache-Control": "no-store"})


@app.post("/api/pdf")
def pdf(data: Cover):
    content = renderPDF.drawToString(drawing_or_error(data))
    return Response(content, media_type="application/pdf", headers={"Content-Disposition": 'attachment; filename="caratula.pdf"', "Cache-Control": "no-store"})


DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'


@app.post('/api/docx')
def word(data: Cover):
    drawing = drawing_or_error(data)
    content = build_docx(drawing, logo())
    return Response(content, media_type=DOCX_MIME, headers={
        'Content-Disposition': 'attachment; filename="caratula.docx"', 'Cache-Control': 'no-store'})


def create_cover(data, content, user_id):
    try:
        return storage.create(data.model_dump(), content, user_id)
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(503, "No se pudo guardar la carátula en este equipo. Comprueba el espacio disponible y vuelve a intentar.") from exc


@app.post('/api/covers')
def create_saved(data: Cover, x_user_id: str = Header('legacy', max_length=100)):
    return create_cover(data, renderPDF.drawToString(drawing_or_error(data)), x_user_id)


@app.put('/api/covers/{cover_id}')
def update_saved(cover_id: str, data: Cover, x_user_id: str = Header('legacy', max_length=100)):
    drawing = drawing_or_error(data)
    try:
        result = storage.update(cover_id, x_user_id, data.model_dump(), renderPDF.drawToString(drawing))
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(503, "No se pudo guardar la carátula en este equipo. Comprueba el espacio disponible y vuelve a intentar.") from exc
    if result is None:
        raise HTTPException(404, 'No se encontró esta carátula para el usuario actual.')
    return result


@app.get('/api/covers')
def history(q: str = Query('', max_length=350), limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0), x_user_id: str = Header('legacy', max_length=100)):
    try:
        return storage.list_covers(q, limit, offset, x_user_id)
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(503, "No se pudieron leer tus carátulas guardadas. Vuelve a intentar.") from exc


def saved_or_error(cover_id):
    try:
        result = storage.get(cover_id)
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(503, "No se pudo abrir la carátula guardada. Vuelve a intentar.") from exc
    if result is None:
        raise HTTPException(404, "No se encontró esta carátula.")
    return result


@app.get('/api/covers/{cover_id}')
def saved_data(cover_id: str, x_user_id: str = Header('legacy', max_length=100)):
    result = saved_or_error(cover_id)
    public = {k: v for k, v in result.items() if k not in {'pdf', 'user_id'}}
    public['owned'] = result['user_id'] == x_user_id
    return public


@app.delete('/api/covers/{cover_id}', status_code=204)
def delete_saved(cover_id: str, x_user_id: str = Header('legacy', max_length=100)):
    try:
        deleted = storage.delete(cover_id, x_user_id)
    except (OSError, sqlite3.Error) as exc:
        raise HTTPException(503, 'No se pudo eliminar la carátula. Vuelve a intentar.') from exc
    if not deleted:
        raise HTTPException(404, 'No se encontró esta carátula.')
    return Response(status_code=204)


@app.get('/api/covers/{cover_id}/pdf')
def saved_pdf(cover_id: str):
    return Response(saved_or_error(cover_id)['pdf'], media_type='application/pdf',
                    headers={'Content-Disposition': 'attachment; filename="caratula.pdf"', 'Cache-Control': 'no-store'})


@app.get('/api/covers/{cover_id}/docx')
def saved_word(cover_id: str):
    data = Cover.model_validate(saved_or_error(cover_id)['data'])
    return Response(build_docx(drawing_or_error(data), logo()), media_type=DOCX_MIME,
                    headers={'Content-Disposition': 'attachment; filename="caratula.docx"', 'Cache-Control': 'no-store'})


# After npm run build, one FastAPI process serves both the UI and API.
if (ROOT / "dist").is_dir():
    app.mount("/", StaticFiles(directory=ROOT / "dist", html=True), name="frontend")
