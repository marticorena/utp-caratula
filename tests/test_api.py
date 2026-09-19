from io import BytesIO
from xml.etree import ElementTree

from fastapi.testclient import TestClient
from pypdf import PdfReader
import pytest

from backend.main import app, Cover, build_drawing, wrap

client = TestClient(app)
EXAMPLE = {
    "course": "Problemas y Desafíos en el Perú Actual",
    "week": "4",
    "title": "Ensayo del oncenio de Leguía",
    "subtitle": "¿Fue autoritario el Oncenio de Leguía?",
    "teacher": "Ana Cyntia, Lázaro Angulo",
    "members": [{"name": "Marticorena Rios, Jean Duanner", "code": "U26213758"}, {"name": "Pinedo García, Romy Raquel", "code": "U25271162"}],
    "city": "Lima", "year": "2026",
}


def read_pdf(data):
    response = client.post('/api/pdf', json=data)
    assert response.status_code == 200, response.text
    assert response.headers['content-type'] == 'application/pdf'
    return PdfReader(BytesIO(response.content))


def test_a4_single_page_embedded_calibri_and_accents():
    pdf = read_pdf(EXAMPLE)
    assert len(pdf.pages) == 1
    page = pdf.pages[0]
    assert float(page.mediabox.width) == pytest.approx(595.276, abs=.01)
    assert float(page.mediabox.height) == pytest.approx(841.89, abs=.01)
    text = page.extract_text()
    for expected in ['Leguía', '¿Fue autoritario', 'U26213758', 'Estudiantes:', 'Lima']:
        assert expected in text
    fonts = [f.get_object() for f in page['/Resources']['/Font'].values()]
    calibri = [f for f in fonts if 'Calibri' in str(f.get('/BaseFont'))]
    assert len(calibri) >= 2
    assert all('/FontFile2' in f['/FontDescriptor'] for f in calibri)


@pytest.mark.parametrize('data', [{}, {'members': []}, {'members': [{'name': '', 'code': ''}]}])
def test_optional_fields_leave_no_labels(data):
    text = read_pdf(data).pages[0].extract_text()
    assert 'Docente:' not in text
    assert 'Asignatura:' not in text
    assert 'Estudiante' not in text


def test_hidden_codes_singular_and_no_dangling_separators():
    data = {**EXAMPLE, 'members': [EXAMPLE['members'][0]], 'show_codes': False, 'year': ''}
    text = read_pdf(data).pages[0].extract_text()
    assert 'Estudiante:' in text and 'Estudiantes:' not in text
    assert 'U26213758' not in text and ' - ' not in text and ' – ' not in text


def test_code_only_member_is_kept_if_visible():
    assert 'U123' in read_pdf({'members': [{'code': 'U123'}]}).pages[0].extract_text()
    assert 'Estudiante' not in read_pdf({'members': [{'code': 'U123'}], 'show_codes': False}).pages[0].extract_text()


def test_svg_uses_font_independent_paths_and_safe_input():
    data = {**EXAMPLE, 'title': '<script>alert("x")</script> & Perú'}
    response = client.post('/api/preview', json=data)
    assert response.status_code == 200
    root = ElementTree.fromstring(response.content)
    pdf_text = read_pdf(data).pages[0].extract_text()
    assert '<script>alert("x")</script> & Perú' in pdf_text
    assert list(root.iter('{http://www.w3.org/2000/svg}path'))
    assert not list(root.iter('{http://www.w3.org/2000/svg}text'))
    assert not list(root.iter('{http://www.w3.org/2000/svg}script'))


def test_utp_identity_is_fixed():
    text = read_pdf({}).pages[0].extract_text()
    assert 'UNIVERSIDAD TECNOLÓGICA DEL PERÚ' in text
    for data in [{'template': 'apa'}, {'institution': 'Otra universidad'}, {'show_logo': False}]:
        assert 'UNIVERSIDAD TECNOLÓGICA DEL PERÚ' in read_pdf(data).pages[0].extract_text()
        assert client.post('/api/preview', json=data).status_code == 200


def test_overflow_is_rejected_in_preview_and_pdf():
    data = {**EXAMPLE, 'members': [{'name': ('Nombre Apellido ' * 7).strip()} for _ in range(30)]}
    for endpoint in ['/api/preview', '/api/pdf']:
        response = client.post(endpoint, json=data)
        assert response.status_code == 422
        assert 'supera una página' in response.json()['detail']


def test_unbroken_text_stays_inside_margins():
    from reportlab.pdfbase.pdfmetrics import stringWidth
    build_drawing(Cover())
    assert all(stringWidth(line, 'Calibri', 11) <= 451.276 for line in wrap('A' * 350))


@pytest.mark.parametrize('data', [{'title': 'a' * 351}, {'members': [{}] * 31}, {'unexpected': True}])
def test_invalid_input(data):
    assert client.post('/api/pdf', json=data).status_code == 422


def test_health():
    assert client.get('/api/health').json()['font'] == 'Calibri'


def test_city_year_are_regular_content_and_delivery_date_is_ignored():
    from reportlab.graphics.shapes import String
    for members in [[], EXAMPLE['members']]:
        drawing = build_drawing(Cover(city='Lima', year='2026', members=members, date='NO MOSTRAR'))
        texts = [item for item in drawing.contents if isinstance(item, String)]
        location = next(item for item in texts if item.text == 'Lima - 2026')
        assert location.y > 75
        assert location is texts[-1]
        assert all('NO MOSTRAR' not in item.text for item in texts)


def test_cover_order_and_equitable_block_spacing():
    from reportlab.graphics.shapes import String
    drawing = build_drawing(Cover(**EXAMPLE, faculty='Ingeniería'))
    texts = sorted((item for item in drawing.contents if isinstance(item, String) and item.y > 108), key=lambda item: -item.y)
    positions = {item.text: item.y for item in texts}
    expected = ['UNIVERSIDAD TECNOLÓGICA DEL PERÚ', 'Ingeniería', 'Semana 4',
                'Ensayo del oncenio de Leguía', 'Asignatura:',
                'Problemas y Desafíos en el Perú Actual', 'Docente:', 'Estudiantes:']
    assert [positions[text] for text in expected] == sorted((positions[text] for text in expected), reverse=True)
    internal_gap = positions['Semana 4'] - positions['Ensayo del oncenio de Leguía']
    block_gaps = [
        positions['¿Fue autoritario el Oncenio de Leguía?'] - positions['Asignatura:'],
        positions['Problemas y Desafíos en el Perú Actual'] - positions['Docente:'],
        positions['Ana Cyntia, Lázaro Angulo'] - positions['Estudiantes:'],
    ]
    assert internal_gap == 18
    assert max(block_gaps) - min(block_gaps) < .01
    assert min(block_gaps) > internal_gap * 2


def test_prefilled_defaults_and_legacy_type_changes():
    import json
    from pathlib import Path
    data = json.loads((Path(__file__).parents[1] / 'src/defaults.json').read_text())
    assert len(read_pdf(data).pages) == 1
    for template in ['apa', 'utp', 'apa']:
        response = client.post('/api/preview', json={**data, 'template': template, 'institution': '', 'show_logo': False})
        assert response.status_code == 200
    assert client.get('/').headers['cache-control'] == 'no-store'
