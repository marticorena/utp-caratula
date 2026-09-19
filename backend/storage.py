"""Local, immutable cover versions. SQLite stores form data and the exact PDF."""
from contextlib import contextmanager, closing
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import unicodedata
from uuid import uuid4

DB_PATH = Path(__file__).resolve().parent.parent / 'data' / 'caratulas.sqlite3'


def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.casefold())
                   if not unicodedata.combining(c))


def searchable(value):
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return ' '.join(searchable(v) for v in value.values())
    if isinstance(value, list):
        return ' '.join(searchable(v) for v in value)
    return ''


@contextmanager
def connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(DB_PATH, timeout=15)) as db, db:
        db.row_factory = sqlite3.Row
        db.execute('''CREATE TABLE IF NOT EXISTS covers (
            id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE,
            created_at TEXT NOT NULL, title TEXT NOT NULL, course TEXT NOT NULL,
            data TEXT NOT NULL, search_text TEXT NOT NULL, pdf BLOB NOT NULL
        )''')
        yield db


def save(data, pdf):
    serialized = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    fingerprint = hashlib.sha256(('utp-calibri11-v2:' + serialized).encode()).hexdigest()
    with connection() as db:
        db.execute('''INSERT OR IGNORE INTO covers
            (id, fingerprint, created_at, title, course, data, search_text, pdf)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)''',
            (uuid4().hex, fingerprint, datetime.now(timezone.utc).isoformat(),
             data.get('title') or data.get('course') or 'Carátula sin título',
             data.get('course', ''), serialized, normalize(searchable(data)), pdf))
        row = db.execute('SELECT id, title, course, created_at FROM covers WHERE fingerprint = ?', (fingerprint,)).fetchone()
        return dict(row)


def list_covers(query, limit, offset):
    tokens = normalize(query).split()
    clause = ' AND '.join('instr(search_text, ?) > 0' for _ in tokens) or '1 = 1'
    with connection() as db:
        total = db.execute(f'SELECT count(*) FROM covers WHERE {clause}', tokens).fetchone()[0]
        rows = db.execute(f'''SELECT id, title, course, created_at FROM covers
            WHERE {clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?''',
            [*tokens, limit, offset]).fetchall()
        return {'items': [dict(row) for row in rows], 'total': total}


def get(cover_id):
    with connection() as db:
        row = db.execute('SELECT id, title, course, created_at, data, pdf FROM covers WHERE id = ?', (cover_id,)).fetchone()
        if row is None:
            return None
        result = dict(row)
        result['data'] = json.loads(result['data'])
        return result


def delete(cover_id):
    with connection() as db:
        return db.execute('DELETE FROM covers WHERE id = ?', (cover_id,)).rowcount > 0
