from io import BytesIO

from docx import Document
from docx.enum.text import WD_LINE_SPACING
from fastapi.testclient import TestClient
import pytest
from reportlab.graphics.shapes import String

from backend.main import DOCX_MIME, Cover, app, build_drawing
from backend.formatting import FONTS

client = TestClient(app)


@pytest.mark.parametrize('page_size,width,height', [('letter', 612, 792), ('a4', 595.276, 841.89)])
@pytest.mark.parametrize('font,name,size', [('calibri', 'Calibri', 11), ('arial', 'Arial', 11),
                                         ('times', 'Times New Roman', 12), ('georgia', 'Georgia', 11)])
def test_format_selection_roundtrips_and_applies_to_all_outputs(page_size, width, height, font, name, size):
    name, size = FONTS[font].name, FONTS[font].size
    from pypdf import PdfReader
    from xml.etree import ElementTree
    data = {'title': 'Investigación del Perú', 'course': 'Historia',
            'teacher': 'María Pérez', 'members': [{'name': 'José García'}],
            'page_size': page_size, 'font': font}
    created = client.post('/api/covers', json=data)
    assert created.status_code == 200, created.text
    cover_id = created.json()['id']
    saved = client.get(f'/api/covers/{cover_id}').json()['data']
    assert saved['page_size'] == page_size and saved['font'] == font
    svg = client.post('/api/preview', json=data)
    assert svg.status_code == 200, svg.text
    root = ElementTree.fromstring(svg.content)
    assert float(root.attrib['width']) == pytest.approx(width, abs=.01)
    assert float(root.attrib['height']) == pytest.approx(height, abs=.01)
    for route in ['/api/docx', f'/api/covers/{cover_id}/docx']:
        response = client.post(route, json=data) if route == '/api/docx' else client.get(route)
        assert response.status_code == 200, response.text
        doc = Document(BytesIO(response.content))
        assert doc.sections[0].page_width.pt == pytest.approx(width, abs=.1)
        assert doc.sections[0].page_height.pt == pytest.approx(height, abs=.1)
        assert doc.styles['Normal'].font.name == name
        assert doc.styles['Normal'].font.size.pt == size
        for p in doc.paragraphs:
            for run in p.runs:
                if run.text:
                    assert run.font.name == name and run.font.size.pt == size
    pdf = PdfReader(BytesIO(client.get(f'/api/covers/{cover_id}/pdf').content))
    assert len(pdf.pages) == 1
    page = pdf.pages[0]
    assert float(page.mediabox.width) == pytest.approx(width, abs=.01)
    fonts = [f.get_object() for f in page['/Resources']['/Font'].values()]
    selected = [f for f in fonts if name.replace(' ', '') in str(f.get('/BaseFont')).replace(' ', '')]
    assert selected
    assert all('/FontFile2' in f['/FontDescriptor'] for f in selected)


@pytest.mark.parametrize('data', [{'page_size': 'legal'}, {'font': 'arial12'}, {'font_size': 40}])
def test_unsupported_format_is_rejected(data):
    assert client.post('/api/preview', json=data).status_code == 422


@pytest.mark.parametrize('font', ['calibri', 'arial', 'times', 'georgia'])
def test_example_fits_with_each_font(font):
    import json
    from pathlib import Path
    data = json.loads((Path(__file__).parents[1] / 'src/defaults.json').read_text(encoding='utf-8'))
    for page_size in ('letter', 'a4'):
        response = client.post('/api/preview', json={**data, 'font': font, 'page_size': page_size, 'year': '2026'})
        assert response.status_code == 200, response.text


def test_docx_editable_letter_calibri_and_saved():
    data = {'title': 'Investigación del Perú', 'city': 'Lima', 'year': '2026', 'faculty': 'Ingeniería', 'members': [{'name': 'José García', 'code': 'U123'}]}
    cover_id = client.post('/api/covers', json=data).json()['id']
    response = client.post('/api/docx', json=data)
    assert response.status_code == 200
    assert response.headers['content-type'] == DOCX_MIME
    doc = Document(BytesIO(response.content))
    assert abs(doc.sections[0].page_width.mm - 215.9) < .1
    assert abs(doc.sections[0].page_height.mm - 279.4) < .1
    assert doc.sections[0].left_margin.inches == 1
    text = '\n'.join(p.text for p in doc.paragraphs)
    assert 'Investigación del Perú' in text and 'José García - U123' in text
    assert 'Lima - 2026' in text
    assert doc.sections[0].footer.paragraphs[0].text == ''
    assert len(doc.inline_shapes) == 1
    for p in doc.paragraphs:
        for run in p.runs:
            if run.text:
                assert run.font.name == FONTS['calibri'].name and run.font.size.pt == 11
    assert client.get(f'/api/covers/{cover_id}/docx').status_code == 200
    assert client.get(f'/api/covers/{cover_id}/pdf').status_code == 200


def test_docx_limits_and_optional_codes():
    response = client.post('/api/docx', json={'show_codes': False, 'members': [{'name': 'María', 'code': 'HIDDEN'}]})
    text = '\n'.join(p.text for p in Document(BytesIO(response.content)).paragraphs)
    assert 'María' in text and 'HIDDEN' not in text
    assert client.post('/api/docx', json={'title': 'x' * 351}).status_code == 422
    assert client.get('/api/covers/not-found/docx').status_code == 404


def test_docx_spacing_uses_enter_paragraphs_and_double_spacing():
    data = {'course': 'Historia', 'week': '4', 'title': 'Investigación del Perú',
            'teacher': 'María Pérez', 'city': 'Lima', 'year': '2026',
            'members': [{'name': 'José García', 'code': 'U123'}]}
    from backend.layout import LINE_HEIGHT
    drawing = build_drawing(Cover(**data))
    document = Document(BytesIO(client.post('/api/docx', json=data).content))
    items = sorted((item for item in drawing.contents if isinstance(item, String)),
                   key=lambda item: -item.y)
    paragraphs = document.paragraphs[1:]
    visible = [(index, p) for index, p in enumerate(paragraphs) if p.text]
    assert [p.text for _, p in visible] == [item.text for item in items]
    assert visible[0][0] == 2
    assert any(not p.text for p in paragraphs)
    normal = document.styles['Normal'].paragraph_format
    assert normal.line_spacing_rule == WD_LINE_SPACING.DOUBLE
    for p in document.paragraphs:
        for spacing in (p.paragraph_format.space_before, p.paragraph_format.space_after):
            assert spacing is None or spacing.pt == 0
    for p in paragraphs:
        if not p.text:
            assert p.paragraph_format.line_spacing_rule == WD_LINE_SPACING.SINGLE
            assert p.paragraph_format.line_spacing == 1
            assert p.paragraph_format.space_before.pt == 0
            assert p.paragraph_format.space_after.pt == 0
    for i in range(1, len(visible)):
        actual_blanks = visible[i][0] - visible[i - 1][0] - 1
        expected_blanks = round((items[i - 1].y - items[i].y - LINE_HEIGHT) / (LINE_HEIGHT / 2))
        assert actual_blanks == expected_blanks
    for label in ('Semana 4', 'Asignatura:', 'Docente:', 'Estudiante:', 'Lima - 2026'):
        index = next(i for i, p in visible if p.text == label)
        assert not paragraphs[index - 1].text
    for margin in ('top_margin', 'bottom_margin', 'left_margin', 'right_margin'):
        assert getattr(document.sections[0], margin).inches == 1
