"""Validation models for UTP cover data."""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

Text = Annotated[str, StringConstraints(strip_whitespace=True, max_length=350)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class Member(BaseModel):
    """Represent a student printed on a cover."""

    model_config = ConfigDict(extra="forbid")

    name: Annotated[
        str,
        StringConstraints(strip_whitespace=True, max_length=245),
    ] = ""
    code: Annotated[
        str,
        StringConstraints(strip_whitespace=True, max_length=30),
    ] = ""


class Cover(BaseModel):
    """Represent the validated, UTP-specific cover input."""

    model_config = ConfigDict(extra="forbid")

    template: Literal["utp"] = "utp"
    course: Text = ""
    week: ShortText = ""
    title: Text = ""
    subtitle: Text = ""
    teacher: ShortText = ""
    city: ShortText = ""
    year: Annotated[
        str,
        StringConstraints(strip_whitespace=True, max_length=10),
    ] = ""
    institution: Literal[
        "Universidad Tecnológica del Perú"
    ] = "Universidad Tecnológica del Perú"
    faculty: Text = ""
    members: list[Member] = Field(default_factory=list, max_length=30)
    show_codes: bool = True
    show_logo: Literal[True] = True

    @model_validator(mode="before")
    @classmethod
    def normalize_legacy_identity(cls, value: Any) -> Any:
        """Accept old clients while enforcing the current UTP identity.

        Args:
            value: Raw request value supplied to Pydantic.

        Returns:
            The value with legacy identity fields normalized when applicable.
        """
        if not isinstance(value, dict):
            return value

        normalized = {key: item for key, item in value.items() if key != "date"}
        normalized.update(
            template="utp",
            institution="Universidad Tecnológica del Perú",
            show_logo=True,
        )
        return normalized
