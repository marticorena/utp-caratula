from io import BytesIO

from fastapi.testclient import TestClient
from pypdf import PdfReader
from backend.main import app
from backend import storage

client = TestClient(app)


def test_saved_draft_keeps_exact_pdf_and_survives_new_client():
    data = {'title': 'Ensayo Perú', 'members': [{'name': 'José García', 'code': 'U123'}]}
    created = client.post('/api/covers', json=data).json()
    response = client.post('/api/pdf', json=data)
    assert response.status_code == 200
    cover_id = created['id']
    assert storage.DB_PATH.exists()
    with TestClient(app) as reopened:
        assert reopened.get('/api/covers').json()['total'] == 1
        saved = reopened.get(f'/api/covers/{cover_id}').json()
        assert saved['data']['title'] == data['title']
        assert saved['data']['members'] == data['members']
        stored_pdf = reopened.get(f'/api/covers/{cover_id}/pdf').content
        assert PdfReader(BytesIO(stored_pdf)).pages[0].extract_text() == PdfReader(BytesIO(response.content)).pages[0].extract_text()


def test_create_update_and_user_scoped_history():
    headers = {'X-User-Id': 'browser-a'}
    first = client.post('/api/covers', json={'title': 'Primera versión'}, headers=headers).json()
    second = client.post('/api/covers', json={'title': 'Primera versión'}, headers=headers).json()
    assert first['id'] != second['id']
    assert client.put(f"/api/covers/{first['id']}", json={'title': 'Versión actualizada'}, headers=headers).status_code == 200
    listing = client.get('/api/covers', headers=headers).json()
    assert listing['total'] == 2
    assert client.get(f"/api/covers/{first['id']}", headers=headers).json()['data']['title'] == 'Versión actualizada'
    assert client.get('/api/covers', headers={'X-User-Id': 'browser-b'}).json()['total'] == 0
    assert client.put(f"/api/covers/{first['id']}", json={'title': 'Ajena'}, headers={'X-User-Id': 'browser-b'}).status_code == 404


def test_search_all_fields_case_accents_partial_and_hidden_codes():
    data = dict(title='Investigación', course='Historia', week='Semana cuatro', subtitle='Democracia',
                teacher='María', city='Arequipa', year='2026', faculty='Ingeniería',
                members=[dict(name='José García', code='U123XYZ')], show_codes=False)
    assert client.post('/api/covers', json=data).status_code == 200
    for query in ['INVESTIGACION', 'histo', 'cuatro', 'democracia', 'maria', 'arequipa', '2026', 'ingenieria', 'jose', 'garcia', '123xyz', 'HISTORIA JOSE']:
        assert client.get('/api/covers', params={'q': query}).json()['total'] == 1, query
    for query in ['noexiste', "' OR 1=1 --", '%', '_']:
        assert client.get('/api/covers', params={'q': query}).json()['total'] == 0


def test_pagination_empty_missing_and_invalid_requests():
    assert client.get('/api/covers').json() == {'items': [], 'total': 0}
    for title in ['Uno', 'Dos', 'Tres']:
        client.post('/api/covers', json={'title': title})
    first = client.get('/api/covers?limit=2').json()
    second = client.get('/api/covers?limit=2&offset=2').json()
    assert first['total'] == second['total'] == 3
    assert len(first['items']) == 2 and len(second['items']) == 1
    assert {e['id'] for e in first['items']}.isdisjoint({e['id'] for e in second['items']})
    assert client.get('/api/covers/missing').status_code == 404
    assert client.get('/api/covers/missing/pdf').status_code == 404
    assert client.get('/api/covers?offset=-1').status_code == 422


def test_preview_and_failed_generation_do_not_save():
    client.post('/api/preview', json={'title': 'Vista previa'})
    assert client.post('/api/covers', json={'title': 'x' * 351}).status_code == 422
    assert client.post('/api/pdf', json={'members': [{'name': 'Nombre Apellido ' * 6}] * 30}).status_code == 422
    assert client.get('/api/covers').json()['total'] == 0


def test_storage_failure_is_explicit(monkeypatch):
    def fail(*args):
        raise OSError('disk full')
    monkeypatch.setattr(storage, 'create', fail)
    response = client.post('/api/covers', json={'title': 'Mi carátula'})
    assert response.status_code == 503
    assert 'No se pudo guardar' in response.json()['detail']


def test_delete_only_selected_cover_and_allow_saving_again():
    first = client.post('/api/covers', json={'title': 'Primera'}).json()['id']
    second = client.post('/api/covers', json={'title': 'Segunda'}).json()['id']
    assert client.delete(f'/api/covers/{first}').status_code == 204
    assert client.get('/api/covers').json()['total'] == 1
    assert client.get('/api/covers?q=Primera').json()['total'] == 0
    for suffix in ['', '/pdf', '/docx']:
        assert client.get(f'/api/covers/{first}{suffix}').status_code == 404
    assert client.get(f'/api/covers/{second}').status_code == 200
    assert client.delete(f'/api/covers/{first}').status_code == 404
    assert client.post('/api/covers', json={'title': 'Primera'}).json()['id'] != first
