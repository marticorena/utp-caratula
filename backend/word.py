"""Editable Word cover generation."""

from io import BytesIO

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_LINE_SPACING
from docx.shared import Pt
from reportlab.graphics import renderPM
from reportlab.graphics.shapes import Drawing, String

from backend.formatting import FONTS, FontPreset

LOGO_WIDTH = 275


def add_blank_lines(doc: Document, count: int, font: FontPreset) -> None:
    """Use ordinary single-spaced Enter paragraphs for vertical separation."""
    for _ in range(count):
        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        formatting = paragraph.paragraph_format
        formatting.space_before = Pt(0)
        formatting.space_after = Pt(0)
        formatting.line_spacing = 1
        formatting.line_spacing_rule = WD_LINE_SPACING.SINGLE
        run = paragraph.add_run()
        run.font.name, run.font.size = font.name, Pt(font.size)


def build_docx(drawing: Drawing, logo: Drawing, font_key: str = 'calibri') -> bytes:
    """Build an editable DOCX from the canonical cover drawing.

    Args:
        drawing: Positioned cover content from the layout engine.
        logo: Vector UTP logo used to create the embedded bitmap fallback.

    Returns:
        Serialized DOCX file bytes.
    """
    font = FONTS[font_key]
    doc = Document()
    section = doc.sections[0]
    section.page_width, section.page_height = Pt(drawing.width), Pt(drawing.height)
    section.top_margin = section.bottom_margin = Pt(72)
    section.left_margin = section.right_margin = Pt(72)
    section.footer_distance = Pt(65)
    normal = doc.styles['Normal']
    normal.font.name, normal.font.size = font.name, Pt(font.size)
    normal.paragraph_format.space_before = Pt(0)
    normal.paragraph_format.space_after = Pt(0)
    normal.paragraph_format.line_spacing = 2
    normal.paragraph_format.line_spacing_rule = WD_LINE_SPACING.DOUBLE
    normal.paragraph_format.widow_control = False
    normal.paragraph_format.keep_with_next = False
    doc.core_properties.title = 'Carátula UTP'
    doc.core_properties.author = ''

    # PNG fallback is supported by Word and other DOCX readers. Text remains editable.
    image = BytesIO(renderPM.drawToString(logo, fmt="PNG", dpi=300))
    logo_height = LOGO_WIDTH * logo.height / logo.width
    logo_paragraph = doc.add_paragraph()
    logo_paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
    # Inline pictures need automatic line expansion; the exact text grid would
    # clip the logo in Word-compatible renderers such as LibreOffice.
    logo_paragraph.paragraph_format.line_spacing = 1
    logo_paragraph.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    logo_paragraph.paragraph_format.space_after = Pt(0)
    logo_paragraph.add_run().add_picture(
        image,
        width=Pt(LOGO_WIDTH),
        height=Pt(logo_height),
    )
    add_blank_lines(doc, 2, font)

    items = sorted(
        (item for item in drawing.contents if isinstance(item, String)),
        key=lambda item: -item.y,
    )
    previous_y = None
    for item in items:
        if previous_y is not None:
            blank_lines = max(
                0, round((previous_y - item.y - font.line_height) / (font.line_height / 2))
            )
            add_blank_lines(doc, blank_lines, font)
        paragraph = doc.add_paragraph()
        paragraph.alignment = WD_ALIGN_PARAGRAPH.CENTER
        paragraph.paragraph_format.space_before = Pt(0)
        paragraph.paragraph_format.space_after = Pt(0)
        run = paragraph.add_run(item.text)
        run.font.name, run.font.size = font.name, Pt(font.size)
        run.bold = item.fontName.endswith('-Bold')
        previous_y = item.y
    result = BytesIO()
    doc.save(result)
    return result.getvalue()
