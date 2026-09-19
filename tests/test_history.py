from fastapi.testclient import TestClient
from backend.main import app
from backend import storage

client = TestClient(app)


def test_download_saves_exact_pdf_and_survives_new_client():
    data = {'title': 'Ensayo Perú', 'members': [{'name': 'José García', 'code': 'U123'}]}
    response = client.post('/api/pdf', json=data)
    assert response.status_code == 200
    cover_id = response.headers['x-cover-id']
    assert storage.DB_PATH.exists()
    with TestClient(app) as reopened:
        assert reopened.get('/api/covers').json()['total'] == 1
        saved = reopened.get(f'/api/covers/{cover_id}').json()
        assert saved['data']['title'] == data['title']
        assert saved['data']['members'] == data['members']
        assert reopened.get(f'/api/covers/{cover_id}/pdf').content == response.content


def test_save_deduplicates_identical_forms_and_preserves_versions():
    first = client.post('/api/covers', json={'title': 'Primera versión'}).json()
    again = client.post('/api/covers', json={'title': 'Primera versión'}).json()
    second = client.post('/api/covers', json={'title': 'Segunda versión'}).json()
    assert first['id'] == again['id'] != second['id']
    listing = client.get('/api/covers').json()
    assert listing['total'] == 2
    assert listing['items'][0]['id'] == second['id']
    assert client.get(f"/api/covers/{first['id']}").json()['data']['title'] == 'Primera versión'


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
    monkeypatch.setattr(storage, 'save', fail)
    response = client.post('/api/pdf', json={'title': 'Mi carátula'})
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
