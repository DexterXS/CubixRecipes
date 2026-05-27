from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Optional


class MetaMode(str, Enum):
    NONE = "none"
    EXACT = "exact"
    WILDCARD = "wildcard"


class BindingMode(str, Enum):
    STRICT = "strict"
    SOFT = "soft"


@dataclass
class ItemRef:
    raw: str
    modid: str
    name: str
    meta_mode: MetaMode = MetaMode.NONE
    meta_value: Optional[int] = None

    @property
    def base_key(self) -> str:
        return f"{self.modid}:{self.name}".lower()


@dataclass
class RecipeCell:
    row: int
    col: int
    raw: Optional[str]
    item: Optional[ItemRef]
    resolution: Optional[dict[str, Any]] = None


@dataclass
class RecipeSource:
    kind: str
    path: Optional[str] = None
    start_offset: Optional[int] = None
    end_offset: Optional[int] = None


@dataclass
class Recipe:
    recipe_uid: str
    recipe_type: str
    binding_mode: BindingMode
    output: ItemRef
    matrix: list[list[RecipeCell]]
    grid_w: int
    grid_h: int
    source: RecipeSource
    raw_text: str
    name: Optional[str] = None
    diagnostics: list[str] = field(default_factory=list)
    output_resolution: Optional[dict[str, Any]] = None


@dataclass
class ResolutionResult:
    item_raw: str
    display_name: Optional[str]
    icon_asset_id: Optional[str]
    icon_url: Optional[str]
    animated: bool
    animation_meta: Optional[dict[str, Any]]
    confidence: float
    strategy: str
    trace: list[dict[str, Any]]


@dataclass
class AssetCandidate:
    asset_id: str
    source_type: str
    path: str
    animated: bool = False
    display_name: Optional[str] = None
    payload: dict[str, Any] = field(default_factory=dict)
