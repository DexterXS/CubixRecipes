from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class MetaMode(str, Enum):
    NONE = "none"
    EXACT = "exact"
    WILDCARD = "wildcard"


class BindingMode(str, Enum):
    STRICT = "strict"
    SOFT = "soft"


@dataclass(slots=True)
class ItemRef:
    raw: str
    modid: str
    name: str
    meta_mode: MetaMode = MetaMode.NONE
    meta_value: int | None = None

    @property
    def base_key(self) -> str:
        return f"{self.modid}:{self.name}"


@dataclass(slots=True)
class RecipeCell:
    row: int
    col: int
    raw: str | None
    item: ItemRef | None


@dataclass(slots=True)
class RecipeSource:
    kind: str
    path: str | None = None
    start_offset: int | None = None
    end_offset: int | None = None


@dataclass(slots=True)
class Recipe:
    recipe_uid: str
    recipe_type: str
    output: ItemRef
    matrix: list[list[RecipeCell]]
    grid_w: int
    grid_h: int
    source: RecipeSource
    raw_text: str
    name: str | None = None
    diagnostics: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ResolutionResult:
    item_raw: str
    display_name: str | None
    icon_asset_id: str | None
    icon_url: str | None
    animated: bool
    confidence: float
    strategy: str
    trace: list[dict[str, Any]]


@dataclass(slots=True)
class AssetCandidate:
    asset_id: str
    source_type: str
    path: str
    animated: bool = False
    display_name: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
