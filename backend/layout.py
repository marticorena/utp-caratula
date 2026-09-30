"""A single layout engine for SVG, PDF, and editable Word output."""

from copy import deepcopy
from functools import lru_cache
import os
from pathlib import Path
import re

from reportlab.graphics.shapes import Drawing, String
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from svglib.svglib import svg2rlg

from backend.models import Cover

ROOT = Path(__file__).resolve().parent.parent
FONT_SIZE = 11
LINE_HEIGHT = 18
PAGE_MARGIN = 72
FONT_REGULAR = "Calibri"
FONT_BOLD = "Calibri-Bold"
Line = tuple[str, bool]
Block = list[Line]


@lru_cache
def setup_fonts() -> None:
    """Register the required Calibri font files with ReportLab.

    Raises:
        RuntimeError: If either required font file is unavailable.
    """
    font_dir = Path(os.environ.get("CALIBRI_FONT_DIR", "C:/Windows/Fonts"))
    font_files = ((FONT_REGULAR, "calibri.ttf"), (FONT_BOLD, "calibrib.ttf"))
    for name, filename in font_files:
        path = font_dir / filename
        if not path.is_file():
            raise RuntimeError(
                "No se encontró Calibri. Configura CALIBRI_FONT_DIR con "
                "calibri.ttf y calibrib.ttf."
            )
        pdfmetrics.registerFont(TTFont(name, str(path)))


@lru_cache
def logo() -> Drawing:
    """Load and cache the canonical UTP logo.

    Returns:
        A ReportLab drawing containing the logo.
    """
    return svg2rlg(str(ROOT / "public" / "logo.svg"))


def clean(value: str) -> str:
    """Collapse control characters and repeated whitespace.

    Args:
        value: User-controlled plain text.

    Returns:
        A one-line, normalized string.
    """
    return " ".join(re.sub(r"[\x00-\x1f\x7f]", " ", value).split())


def format_week(value: str) -> str:
    """Normalize numeric and legacy week values for display.

    Args:
        value: Week text from the form.

    Returns:
        The formatted week label.
    """
    normalized = clean(value)
    legacy = re.fullmatch(r"semana\s*(\d+)", normalized, re.IGNORECASE)
    if legacy:
        return f"Semana {legacy.group(1)}"
    return f"Semana {normalized}" if normalized.isdigit() else normalized


def wrap(value: str, bold: bool = False) -> list[str]:
    """Wrap text to the printable A4 width, including unbroken strings.

    Args:
        value: Plain text to wrap.
        bold: Whether to measure the text with the bold font.

    Returns:
        Lines whose rendered widths fit inside the page margins.
    """
    normalized = clean(value)
    font = FONT_BOLD if bold else FONT_REGULAR
    max_width = A4[0] - (PAGE_MARGIN * 2)
    lines: list[str] = []
    line = ""

    for word in normalized.split():
        if line and _text_width(f"{line} {word}", font) > max_width:
            lines.append(line)
            line = ""
        for character in word:
            candidate = line + character
            if line and _text_width(candidate, font) > max_width:
                lines.append(line.rstrip())
                line = character
            else:
                line = candidate
        line += " "

    if line.strip():
        lines.append(line.strip())
    return lines


def _text_width(value: str, font: str) -> float:
    """Return the rendered width of text using the cover font."""
    return pdfmetrics.stringWidth(value, font, FONT_SIZE)


class CoverLayoutEngine:
    """Compose validated cover data into a ReportLab drawing."""

    def build(self, data: Cover) -> Drawing:
        """Build an A4 cover drawing.

        Args:
            data: Validated cover content.

        Returns:
            The composed vector drawing.

        Raises:
            ValueError: If the content cannot fit on one A4 page.
        """
        setup_fonts()
        width, height = A4
        drawing = Drawing(width, height)
        blocks = self._content_blocks(data)
        content_start = self._add_logo(drawing, data, height, width)
        content_start = self._add_header(drawing, data, content_start, height, width)
        self._add_blocks(drawing, blocks, content_start, height, width)
        return drawing

    @staticmethod
    def _content_blocks(data: Cover) -> list[Block]:
        """Build semantic content blocks before positioning them."""
        blocks: list[Block] = []

        def add_block(*entries: Line) -> None:
            """Wrap and append a block when it contains visible text.

            Args:
                *entries: Text and emphasis pairs in display order.
            """
            lines = [
                (line, bold)
                for value, bold in entries
                for line in wrap(value, bold)
            ]
            if lines:
                blocks.append(lines)

        members = [
            member
            for member in data.members
            if clean(member.name) or (data.show_codes and clean(member.code))
        ]
        add_block(
            (format_week(data.week), False),
            (data.title, True),
            (data.subtitle, False),
        )
        if clean(data.course):
            add_block(("Asignatura:", True), (data.course, False))
        if clean(data.teacher):
            add_block(("Docente:", True), (data.teacher, False))
        if members:
            names = [
                " - ".join(
                    filter(
                        None,
                        [
                            clean(member.name),
                            clean(member.code) if data.show_codes else "",
                        ],
                    )
                )
                for member in members
            ]
            label = "Estudiante:" if len(members) == 1 else "Estudiantes:"
            add_block((label, True), *((name, False) for name in names))
        add_block(
            (" - ".join(filter(None, [clean(data.city), clean(data.year)])), False)
        )
        return blocks

    @staticmethod
    def _add_logo(
        drawing: Drawing,
        data: Cover,
        page_height: float,
        page_width: float,
    ) -> float:
        """Add the fixed logo and return the next vertical offset."""
        start = float(PAGE_MARGIN)
        if not data.show_logo:
            return start

        mark = deepcopy(logo())
        target_width = 275
        scale = target_width / mark.width
        mark.scale(scale, scale)
        mark_height = mark.height * scale
        mark.translate(
            (page_width - target_width) / 2 / scale,
            (page_height - PAGE_MARGIN - mark_height) / scale,
        )
        drawing.add(mark)
        return start + mark_height + 38

    @staticmethod
    def _add_header(
        drawing: Drawing,
        data: Cover,
        start: float,
        page_height: float,
        page_width: float,
    ) -> float:
        """Add the university header and return the next vertical offset."""
        entries = ((data.institution.upper(), True), (data.faculty, False))
        for value, bold in entries:
            for text in wrap(value, bold):
                drawing.add(
                    _centered_string(page_width, page_height - start - 11, text, bold)
                )
                start += LINE_HEIGHT
        return start

    @staticmethod
    def _add_blocks(
        drawing: Drawing,
        blocks: list[Block],
        start: float,
        page_height: float,
        page_width: float,
    ) -> None:
        """Distribute content blocks evenly in the remaining page area."""
        content_height = sum(len(block) * LINE_HEIGHT for block in blocks)
        free_space = page_height - PAGE_MARGIN - start - content_height
        if free_space < 0:
            raise ValueError(
                "El contenido supera una página A4. Acorta el texto o quita "
                "algunos datos para mantener Calibri 11 y los márgenes."
            )

        block_gap = free_space / (len(blocks) + 1) if blocks else 0
        y = page_height - start - block_gap - 11
        for lines in blocks:
            for text, bold in lines:
                drawing.add(_centered_string(page_width, y, text, bold))
                y -= LINE_HEIGHT
            y -= block_gap


def _centered_string(width: float, y: float, text: str, bold: bool) -> String:
    """Create a consistently styled, horizontally centered text node."""
    return String(
        width / 2,
        y,
        text,
        fontName=FONT_BOLD if bold else FONT_REGULAR,
        fontSize=FONT_SIZE,
        textAnchor="middle",
    )


_DEFAULT_ENGINE = CoverLayoutEngine()


def build_drawing(data: Cover) -> Drawing:
    """Build a cover with the default layout engine.

    Args:
        data: Validated cover content.

    Returns:
        The composed vector drawing.
    """
    return _DEFAULT_ENGINE.build(data)
