"""Application services that coordinate layout, files, and persistence."""

from typing import Any, Protocol

from reportlab.graphics import renderPDF, renderSVG
from reportlab.graphics.shapes import Drawing, String
from reportlab.graphics.utils import text2Path

from backend import storage
from backend.layout import CoverLayoutEngine, logo
from backend.models import Cover
from backend.word import build_docx


class CoverRepository(Protocol):
    """Persistence operations required by the cover application."""

    def create(
        self,
        data: dict[str, Any],
        pdf: bytes,
        user_id: str,
    ) -> dict[str, Any]:
        """Persist a new cover."""

    def update(
        self,
        cover_id: str,
        user_id: str,
        data: dict[str, Any],
        pdf: bytes,
    ) -> dict[str, Any] | None:
        """Replace an owned cover."""

    def list(
        self,
        query: str,
        limit: int,
        offset: int,
        user_id: str,
    ) -> dict[str, Any]:
        """List covers owned by a user."""

    def get(self, cover_id: str) -> dict[str, Any] | None:
        """Load a cover by identifier."""

    def delete(self, cover_id: str, user_id: str) -> bool:
        """Delete an owned cover."""


class DefaultCoverRepository:
    """Adapt the existing storage module to the repository protocol."""

    def create(
        self,
        data: dict[str, Any],
        pdf: bytes,
        user_id: str,
    ) -> dict[str, Any]:
        """Persist a new cover."""
        return storage.create(data, pdf, user_id)

    def update(
        self,
        cover_id: str,
        user_id: str,
        data: dict[str, Any],
        pdf: bytes,
    ) -> dict[str, Any] | None:
        """Replace an owned cover."""
        return storage.update(cover_id, user_id, data, pdf)

    def list(
        self,
        query: str,
        limit: int,
        offset: int,
        user_id: str,
    ) -> dict[str, Any]:
        """List covers owned by a user."""
        return storage.list_covers(query, limit, offset, user_id)

    def get(self, cover_id: str) -> dict[str, Any] | None:
        """Load a cover by identifier."""
        return storage.get(cover_id)

    def delete(self, cover_id: str, user_id: str) -> bool:
        """Delete an owned cover."""
        return storage.delete(cover_id, user_id)


class CoverService:
    """Coordinate cover generation and storage use cases.

    Args:
        repository: Persistence implementation for saved covers.
        layout_engine: Drawing implementation shared by every output format.
    """

    def __init__(
        self,
        repository: CoverRepository,
        layout_engine: CoverLayoutEngine,
    ) -> None:
        """Initialize the service with replaceable dependencies.

        Args:
            repository: Persistence implementation for saved covers.
            layout_engine: Drawing implementation shared by output formats.
        """
        self._repository = repository
        self._layout_engine = layout_engine

    def drawing(self, data: Cover) -> Drawing:
        """Build the canonical drawing for cover data."""
        return self._layout_engine.build(data)

    def preview(self, data: Cover) -> bytes:
        """Render a device-independent SVG preview."""
        drawing = self.drawing(data)
        drawing.contents = [
            self._outline_text(item) if isinstance(item, String) else item
            for item in drawing.contents
        ]
        return renderSVG.drawToString(drawing)

    def pdf(self, data: Cover) -> bytes:
        """Render a searchable vector PDF."""
        return renderPDF.drawToString(self.drawing(data))

    def docx(self, data: Cover) -> bytes:
        """Render an editable Word document."""
        return build_docx(self.drawing(data), logo())

    def create(self, data: Cover, user_id: str) -> dict[str, Any]:
        """Render and persist a new cover."""
        return self._repository.create(data.model_dump(), self.pdf(data), user_id)

    def update(
        self,
        cover_id: str,
        data: Cover,
        user_id: str,
    ) -> dict[str, Any] | None:
        """Render and replace an owned cover."""
        return self._repository.update(
            cover_id,
            user_id,
            data.model_dump(),
            self.pdf(data),
        )

    def list(
        self,
        query: str,
        limit: int,
        offset: int,
        user_id: str,
    ) -> dict[str, Any]:
        """List saved covers."""
        return self._repository.list(query, limit, offset, user_id)

    def get(self, cover_id: str) -> dict[str, Any] | None:
        """Load a saved cover."""
        return self._repository.get(cover_id)

    def delete(self, cover_id: str, user_id: str) -> bool:
        """Delete an owned saved cover."""
        return self._repository.delete(cover_id, user_id)

    @staticmethod
    def _outline_text(item: String) -> Any:
        """Convert one text node to paths for a portable SVG preview."""
        return text2Path(
            item.text,
            x=item.x,
            y=item.y,
            fontName=item.fontName,
            fontSize=item.fontSize,
            anchor=item.textAnchor,
            fillColor=item.fillColor,
            strokeColor=None,
        )
