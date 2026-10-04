"""Persistent cover storage for Neon and other PostgreSQL providers."""

from contextlib import contextmanager
from threading import Lock
from uuid import uuid4

from backend import storage


class PostgresCoverRepository:
    def __init__(self, url: str):
        self._url = url
        self._ready = False
        self._lock = Lock()

    @contextmanager
    def connection(self):
        import psycopg
        from psycopg.rows import dict_row
        try:
            with psycopg.connect(self._url, connect_timeout=15, row_factory=dict_row) as db:
                yield db
        except psycopg.Error:
            # Connection errors can contain credentials or provider hostnames.
            raise OSError('No se pudo conectar con la base de datos.') from None

    def initialize(self):
        if self._ready:
            return
        with self._lock:
            if self._ready:
                return
            with self.connection() as db:
                db.execute('''CREATE TABLE IF NOT EXISTS covers (
                    id TEXT PRIMARY KEY, created_at TEXT NOT NULL,
                    title TEXT NOT NULL, course TEXT NOT NULL,
                    data TEXT NOT NULL, search_text TEXT NOT NULL,
                    user_id TEXT NOT NULL
                )''')
                db.execute('CREATE INDEX IF NOT EXISTS covers_user_created ON covers(user_id, created_at DESC)')
            self._ready = True

    def create(self, data, pdf, user_id='legacy'):
        self.initialize()
        cover_id = uuid4().hex
        values = storage.values(cover_id, user_id, data, b'')
        with self.connection() as db:
            row = db.execute('''INSERT INTO covers
                (id, created_at, title, course, data, search_text, user_id)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING id, title, course, created_at''',
                (values[0], *values[2:7], user_id)).fetchone()
            return storage._summary(row)

    def update(self, cover_id, user_id, data, pdf):
        self.initialize()
        values = storage.values(cover_id, user_id, data, b'')
        with self.connection() as db:
            row = db.execute('''UPDATE covers SET created_at = %s,
                title = %s, course = %s, data = %s, search_text = %s
                WHERE id = %s AND user_id = %s
                RETURNING id, title, course, created_at''',
                (*values[2:7], cover_id, user_id)).fetchone()
            return storage._summary(row) if row else None

    def list(self, query, limit, offset, user_id='legacy'):
        self.initialize()
        tokens = storage.normalize(query).split()
        clause = ' AND '.join('strpos(search_text, %s) > 0' for _ in tokens) or 'TRUE'
        params = [user_id, *tokens]
        with self.connection() as db:
            total = db.execute(f'SELECT count(*) AS total FROM covers WHERE user_id = %s AND {clause}', params).fetchone()['total']
            rows = db.execute(f'''SELECT id, title, course, created_at FROM covers
                WHERE user_id = %s AND {clause}
                ORDER BY created_at DESC, id DESC LIMIT %s OFFSET %s''',
                [*params, limit, offset]).fetchall()
            return {'items': [storage._summary(row) for row in rows], 'total': total}

    def get(self, cover_id):
        self.initialize()
        with self.connection() as db:
            row = db.execute('SELECT * FROM covers WHERE id = %s', (cover_id,)).fetchone()
            if not row:
                return None
            return storage._saved_record({**row, 'pdf': b''})

    def delete(self, cover_id, user_id='legacy'):
        self.initialize()
        with self.connection() as db:
            return db.execute('DELETE FROM covers WHERE id = %s AND user_id = %s',
                              (cover_id, user_id)).rowcount > 0
