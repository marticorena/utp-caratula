"""SQLite repository for locally saved cover drafts."""

from collections.abc import Iterator
from contextlib import closing, contextmanager
from datetime import datetime, timezone
import json
from pathlib import Path
import sqlite3
from typing import Any
import unicodedata
from uuid import uuid4

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "caratulas.sqlite3"
CoverData = dict[str, Any]
CoverRecord = dict[str, Any]


def normalize(text: str) -> str:
    """Normalize text for accent- and case-insensitive search.

    Args:
        text: Text to normalize.

    Returns:
        Case-folded text without combining accents.
    """
    return "".join(
        character
        for character in unicodedata.normalize("NFKD", text.casefold())
        if not unicodedata.combining(character)
    )


def searchable(value: Any) -> str:
    """Flatten nested JSON-compatible data into searchable text.

    Args:
        value: JSON-compatible scalar or nested collection.

    Returns:
        All string values joined with spaces.
    """
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return " ".join(searchable(item) for item in value.values())
    if isinstance(value, list):
        return " ".join(searchable(item) for item in value)
    return ""


class SQLiteCoverRepository:
    """Persist cover records behind a small repository abstraction.

    Args:
        database_path: Optional explicit database path. When omitted, the
            module-level ``DB_PATH`` is resolved for every operation, which
            also keeps test configuration simple.
    """

    def __init__(self, database_path: Path | None = None) -> None:
        """Initialize the repository.

        Args:
            database_path: Optional database location override.
        """
        self._database_path = database_path

    @property
    def database_path(self) -> Path:
        """Return the active database path."""
        return self._database_path or DB_PATH

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        """Open an initialized transactional SQLite connection."""
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        with closing(
            sqlite3.connect(self.database_path, timeout=15)
        ) as database, database:
            database.row_factory = sqlite3.Row
            self._ensure_schema(database)
            yield database

    @staticmethod
    def _ensure_schema(database: sqlite3.Connection) -> None:
        """Create or migrate the storage schema."""
        database.execute(
            """CREATE TABLE IF NOT EXISTS covers (
                id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL, title TEXT NOT NULL,
                course TEXT NOT NULL, data TEXT NOT NULL,
                search_text TEXT NOT NULL, pdf BLOB NOT NULL
            )"""
        )
        columns = {
            row["name"] for row in database.execute("PRAGMA table_info(covers)")
        }
        if "user_id" not in columns:
            database.execute(
                "ALTER TABLE covers ADD COLUMN user_id TEXT NOT NULL "
                "DEFAULT 'legacy'"
            )
        database.execute(
            "CREATE INDEX IF NOT EXISTS covers_user_created "
            "ON covers(user_id, created_at DESC)"
        )

    @staticmethod
    def _values(
        cover_id: str,
        user_id: str,
        data: CoverData,
        pdf: bytes,
    ) -> tuple[Any, ...]:
        """Convert domain data to the ordered database representation."""
        serialized = json.dumps(
            data,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        title = data.get("title") or data.get("course") or "Carátula sin título"
        return (
            cover_id,
            f"draft:{cover_id}",
            datetime.now(timezone.utc).isoformat(),
            title,
            data.get("course", ""),
            serialized,
            normalize(searchable(data)),
            pdf,
            user_id,
        )

    def create(
        self,
        data: CoverData,
        pdf: bytes,
        user_id: str = "legacy",
    ) -> CoverRecord:
        """Create a cover and return its summary.

        Args:
            data: JSON-compatible cover data.
            pdf: Exact PDF bytes to preserve in history.
            user_id: Identifier of the browser that owns the cover.

        Returns:
            A summary of the created record.
        """
        cover_id = uuid4().hex
        with self.connection() as database:
            if user_id != "legacy":
                database.execute(
                    "UPDATE covers SET user_id = ? WHERE user_id = 'legacy'",
                    (user_id,),
                )
            database.execute(
                """INSERT INTO covers
                (id, fingerprint, created_at, title, course, data,
                 search_text, pdf, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                self._values(cover_id, user_id, data, pdf),
            )
            row = database.execute(
                "SELECT id, title, course, created_at FROM covers WHERE id = ?",
                (cover_id,),
            ).fetchone()
            return dict(row)

    def update(
        self,
        cover_id: str,
        user_id: str,
        data: CoverData,
        pdf: bytes,
    ) -> CoverRecord | None:
        """Replace an owned cover and return its summary when found.

        Args:
            cover_id: Identifier of the cover to replace.
            user_id: Identifier of the expected owner.
            data: Updated JSON-compatible cover data.
            pdf: Updated PDF bytes.

        Returns:
            The updated summary, or ``None`` when ownership does not match.
        """
        record = self._values(cover_id, user_id, data, pdf)
        with self.connection() as database:
            changed = database.execute(
                """UPDATE covers SET fingerprint = ?, created_at = ?,
                title = ?, course = ?, data = ?, search_text = ?, pdf = ?
                WHERE id = ? AND user_id = ?""",
                (*record[1:8], cover_id, user_id),
            ).rowcount
            if not changed:
                return None
            row = database.execute(
                "SELECT id, title, course, created_at FROM covers WHERE id = ?",
                (cover_id,),
            ).fetchone()
            return dict(row)

    def list(
        self,
        query: str,
        limit: int,
        offset: int,
        user_id: str = "legacy",
    ) -> dict[str, Any]:
        """Return a paginated, owner-scoped cover listing.

        Args:
            query: Free-text search query.
            limit: Maximum number of records to return.
            offset: Number of matching records to skip.
            user_id: Identifier of the owner.

        Returns:
            A mapping containing ``items`` and the total match count.
        """
        tokens = normalize(query).split()
        clause = " AND ".join(
            "instr(search_text, ?) > 0" for _ in tokens
        ) or "1 = 1"
        parameters = [user_id, *tokens]
        with self.connection() as database:
            total = database.execute(
                f"SELECT count(*) FROM covers "
                f"WHERE user_id = ? AND {clause}",
                parameters,
            ).fetchone()[0]
            rows = database.execute(
                f"""SELECT id, title, course, created_at FROM covers
                WHERE user_id = ? AND {clause}
                ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?""",
                [*parameters, limit, offset],
            ).fetchall()
            return {"items": [dict(row) for row in rows], "total": total}

    def get(self, cover_id: str) -> CoverRecord | None:
        """Return a complete cover record by identifier.

        Args:
            cover_id: Identifier of the cover to load.

        Returns:
            The complete record, or ``None`` when it does not exist.
        """
        with self.connection() as database:
            row = database.execute(
                """SELECT id, title, course, created_at, data, pdf, user_id
                FROM covers WHERE id = ?""",
                (cover_id,),
            ).fetchone()
            if row is None:
                return None
            result = dict(row)
            result["data"] = json.loads(result["data"])
            return result

    def delete(self, cover_id: str, user_id: str = "legacy") -> bool:
        """Delete an owned cover.

        Args:
            cover_id: Identifier of the cover to delete.
            user_id: Identifier of the expected owner.

        Returns:
            Whether a matching record was deleted.
        """
        with self.connection() as database:
            return (
                database.execute(
                    "DELETE FROM covers WHERE id = ? AND user_id = ?",
                    (cover_id, user_id),
                ).rowcount
                > 0
            )


_DEFAULT_REPOSITORY = SQLiteCoverRepository()


@contextmanager
def connection() -> Iterator[sqlite3.Connection]:
    """Open a connection using the default repository."""
    with _DEFAULT_REPOSITORY.connection() as database:
        yield database


def values(
    cover_id: str,
    user_id: str,
    data: CoverData,
    pdf: bytes,
) -> tuple[Any, ...]:
    """Return storage values using the default repository."""
    return _DEFAULT_REPOSITORY._values(cover_id, user_id, data, pdf)


def create(
    data: CoverData,
    pdf: bytes,
    user_id: str = "legacy",
) -> CoverRecord:
    """Create a cover using the default repository."""
    return _DEFAULT_REPOSITORY.create(data, pdf, user_id)


def update(
    cover_id: str,
    user_id: str,
    data: CoverData,
    pdf: bytes,
) -> CoverRecord | None:
    """Update a cover using the default repository."""
    return _DEFAULT_REPOSITORY.update(cover_id, user_id, data, pdf)


def list_covers(
    query: str,
    limit: int,
    offset: int,
    user_id: str = "legacy",
) -> dict[str, Any]:
    """List covers using the default repository."""
    return _DEFAULT_REPOSITORY.list(query, limit, offset, user_id)


def get(cover_id: str) -> CoverRecord | None:
    """Get a cover using the default repository."""
    return _DEFAULT_REPOSITORY.get(cover_id)


def delete(cover_id: str, user_id: str = "legacy") -> bool:
    """Delete a cover using the default repository."""
    return _DEFAULT_REPOSITORY.delete(cover_id, user_id)
