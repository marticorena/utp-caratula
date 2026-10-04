"""Integration checks against a disposable PostgreSQL database."""

import os
from io import BytesIO
from uuid import uuid4

from docx import Document
from fastapi.testclient import TestClient
import pytest

from backend import storage
from backend.main import app


@pytest.fixture
def cloud_client(monkeypatch):
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('TEST_DATABASE_URL is required for PostgreSQL integration checks')
    monkeypatch.setenv('DATABASE_URL', url)
    monkeypatch.setenv('REQUIRE_DATABASE_URL', '1')
    monkeypatch.setattr(storage, '_POSTGRES_REPOSITORY', None)
    with TestClient(app) as client:
        yield client


def test_cloud_history_survives_reconnect_and_preserves_ownership(cloud_client, monkeypatch):
    user = uuid4().hex
    headers = {'X-User-Id': user}
    data = {'title': 'Investigación Perú', 'page_size': 'a4', 'font': 'times'}
    created = cloud_client.post('/api/covers', json=data, headers=headers)
    assert created.status_code == 200, created.text
    cover_id = created.json()['id']
    try:
        # Simulate a new process/redeploy: drop the repository object only.
        monkeypatch.setattr(storage, '_POSTGRES_REPOSITORY', None)
        result = cloud_client.get('/api/covers?q=investigacion', headers=headers).json()
        assert any(item['id'] == cover_id for item in result['items'])
        assert cloud_client.get('/api/covers', headers={'X-User-Id': uuid4().hex}).json()['total'] == 0
        assert cloud_client.put(f'/api/covers/{cover_id}', json=data, headers={'X-User-Id': 'other'}).status_code == 404
        updated = cloud_client.put(f'/api/covers/{cover_id}', json={**data, 'title': 'Versión actualizada'}, headers=headers)
        assert updated.status_code == 200
        saved = cloud_client.get(f'/api/covers/{cover_id}', headers=headers).json()['data']
        assert saved['font'] == 'times' and saved['page_size'] == 'a4'
        assert cloud_client.get(f'/api/covers/{cover_id}/pdf').content.startswith(b'%PDF')
        word = Document(BytesIO(cloud_client.get(f'/api/covers/{cover_id}/docx').content))
        assert 'Versión actualizada' in '\n'.join(p.text for p in word.paragraphs)
        for query in ["' OR 1=1 --", '%', '_']:
            assert cloud_client.get('/api/covers', params={'q': query}, headers=headers).json()['total'] == 0
        assert cloud_client.delete(f'/api/covers/{cover_id}', headers={'X-User-Id': 'other'}).status_code == 404
    finally:
        assert cloud_client.delete(f'/api/covers/{cover_id}', headers=headers).status_code == 204
    assert cloud_client.get(f'/api/covers/{cover_id}').status_code == 404


def test_required_cloud_database_never_falls_back_to_sqlite(monkeypatch):
    monkeypatch.delenv('DATABASE_URL', raising=False)
    monkeypatch.setenv('REQUIRE_DATABASE_URL', '1')
    with pytest.raises(OSError, match='DATABASE_URL'):
        storage.active_repository()
