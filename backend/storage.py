"""Local cover drafts. SQLite stores form data and the current exact PDF."""
from contextlib import contextmanager, closing
from datetime import datetime, timezone
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
        columns = {row['name'] for row in db.execute('PRAGMA table_info(covers)')}
        if 'user_id' not in columns:
            db.execute("ALTER TABLE covers ADD COLUMN user_id TEXT NOT NULL DEFAULT 'legacy'")
        db.execute('CREATE INDEX IF NOT EXISTS covers_user_created ON covers(user_id, created_at DESC)')
        yield db


def values(cover_id, user_id, data, pdf):
    serialized = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
    return (cover_id, f'draft:{cover_id}', datetime.now(timezone.utc).isoformat(),
            data.get('title') or data.get('course') or 'Carátula sin título',
            data.get('course', ''), serialized, normalize(searchable(data)), pdf, user_id)


def create(data, pdf, user_id='legacy'):
    cover_id = uuid4().hex
    with connection() as db:
        # Preserve histories created before temporary browser users existed.
        if user_id != 'legacy':
            db.execute("UPDATE covers SET user_id = ? WHERE user_id = 'legacy'", (user_id,))
        db.execute('''INSERT INTO covers
            (id, fingerprint, created_at, title, course, data, search_text, pdf, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)''', values(cover_id, user_id, data, pdf))
        row = db.execute('SELECT id, title, course, created_at FROM covers WHERE id = ?', (cover_id,)).fetchone()
        return dict(row)


def update(cover_id, user_id, data, pdf):
    record = values(cover_id, user_id, data, pdf)
    with connection() as db:
        changed = db.execute('''UPDATE covers SET fingerprint = ?, created_at = ?, title = ?, course = ?,
            data = ?, search_text = ?, pdf = ? WHERE id = ? AND user_id = ?''',
            (*record[1:8], cover_id, user_id)).rowcount
        if not changed:
            return None
        row = db.execute('SELECT id, title, course, created_at FROM covers WHERE id = ?', (cover_id,)).fetchone()
        return dict(row)


def list_covers(query, limit, offset, user_id='legacy'):
    tokens = normalize(query).split()
    clause = ' AND '.join('instr(search_text, ?) > 0' for _ in tokens) or '1 = 1'
    with connection() as db:
        total = db.execute(f'SELECT count(*) FROM covers WHERE user_id = ? AND {clause}', [user_id, *tokens]).fetchone()[0]
        rows = db.execute(f'''SELECT id, title, course, created_at FROM covers
            WHERE user_id = ? AND {clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?''',
            [user_id, *tokens, limit, offset]).fetchall()
        return {'items': [dict(row) for row in rows], 'total': total}


def get(cover_id):
    with connection() as db:
        row = db.execute('SELECT id, title, course, created_at, data, pdf, user_id FROM covers WHERE id = ?', (cover_id,)).fetchone()
        if row is None:
            return None
        result = dict(row)
        result['data'] = json.loads(result['data'])
        return result


def delete(cover_id, user_id='legacy'):
    with connection() as db:
        return db.execute('DELETE FROM covers WHERE id = ? AND user_id = ?', (cover_id, user_id)).rowcount > 0
