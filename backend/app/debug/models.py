from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Optional


@dataclass
class DebugIssue:
    level: str
    category: str
    message: str
    file_path: Optional[str] = None
    source_path: Optional[str] = None
    line: Optional[int] = None
    fragment: Optional[str] = None
    error_type: Optional[str] = None
    details: dict[str, Any] = field(default_factory=dict)


@dataclass
class DebugPathEntry:
    label: str
    path: str
    exists: bool
    kind: str
    used: bool
    source: str
    message: str


@dataclass
class RecipeBlockDiagnostic:
    recipe_uid: str
    recipe_type: str
    output_raw: str
    recognized_types: list[str]
    recipe_count: int
    file_path: str
    start_offset: int
    end_offset: int
    diagnostics: list[str] = field(default_factory=list)


@dataclass
class RecipeFileDiagnostic:
    path: str
    exists: bool
    discovered: bool
    scanned: bool
    read_ok: bool
    source: str
    recipe_count: int = 0
    recognized_types: list[str] = field(default_factory=list)
    blocks: list[RecipeBlockDiagnostic] = field(default_factory=list)
    unparsed_fragments: list[dict[str, Any]] = field(default_factory=list)
    errors: list[DebugIssue] = field(default_factory=list)


@dataclass
class AssetSourceDiagnostic:
    source_path: str
    source_kind: str
    exists: bool
    scanned: bool
    indexed_files: int = 0
    skipped_files: list[dict[str, Any]] = field(default_factory=list)
    errors: list[DebugIssue] = field(default_factory=list)
    registered_keys: list[str] = field(default_factory=list)


@dataclass
class ResolverDiagnostic:
    item_raw: str
    raw_id: str
    item_key: str
    display_name_found: bool
    icon_found: bool
    display_name: Optional[str]
    icon_asset_id: Optional[str]
    icon_url: Optional[str]
    source: Optional[str]
    strategy: str
    confidence: float
    checked_sources: list[str] = field(default_factory=list)
    checked_keys: list[str] = field(default_factory=list)
    reason: Optional[str] = None
    trace: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ParseDiagnostic:
    input_kind: str
    raw_input: str
    success: bool
    output_raw: Optional[str] = None
    matrix_width: int = 0
    matrix_height: int = 0
    parsed_cells: list[dict[str, Any]] = field(default_factory=list)
    failed_cells: list[dict[str, Any]] = field(default_factory=list)
    null_cells: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    errors: list[DebugIssue] = field(default_factory=list)


@dataclass
class DebugSnapshot:
    summary: dict[str, int] = field(default_factory=dict)
    config: dict[str, Any] = field(default_factory=dict)
    recipe_scan: dict[str, Any] = field(default_factory=dict)
    asset_scan: dict[str, Any] = field(default_factory=dict)
    resolver: dict[str, Any] = field(default_factory=dict)
    parse: dict[str, Any] = field(default_factory=dict)
    errors: list[dict[str, Any]] = field(default_factory=list)
    missing_links: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
