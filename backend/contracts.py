"""Shared static types for application and persistence boundaries."""

from typing import TypeAlias, TypedDict

JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]
CoverData: TypeAlias = dict[str, JsonValue]
StorageValues: TypeAlias = tuple[
    str,
    str,
    str,
    str,
    str,
    str,
    str,
    bytes,
    str,
]


class CoverSummary(TypedDict):
    """Fields returned for cover lists and write operations."""

    id: str
    title: str
    course: str
    created_at: str


class CoverHistory(TypedDict):
    """Paginated cover summaries."""

    items: list[CoverSummary]
    total: int


class SavedCoverRecord(CoverSummary):
    """Complete repository record including private storage fields."""

    data: CoverData
    pdf: bytes
    user_id: str


