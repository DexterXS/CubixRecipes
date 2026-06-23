from __future__ import annotations

import re
from pathlib import Path


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def parse_oredict_groups(path: Path) -> dict[str, list[str]]:
    """Return forward index: {ore_group_name: [item_raw, ...]}."""
    return _parse(path)[0]


def parse_oredict_reverse(path: Path) -> dict[str, list[str]]:
    """Return reverse index: {normalised_item_key: [ore_group_name, ...]}.

    Key is lowercase ``modid:itemname`` **without** meta so that wildcard
    entries still match all meta variants.
    """
    return _parse(path)[1]


def build_oredict_indexes(
    path: Path,
) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    """Return (groups_index, reverse_index) in one pass."""
    return _parse(path)


# ---------------------------------------------------------------------------
# Internal parsing
# ---------------------------------------------------------------------------

_HEADER_RE = re.compile(r'^Ore entries for <ore:(\w+)> :')
_ITEM_RE = re.compile(r'^\s+<([^>]+)>')


def _parse(path: Path) -> tuple[dict[str, list[str]], dict[str, list[str]]]:
    if not path.is_file():
        return {}, {}

    groups: dict[str, list[str]] = {}
    reverse: dict[str, list[str]] = {}
    current_group: str | None = None

    for raw_line in _read_lines(path):
        header_match = _HEADER_RE.match(raw_line)
        if header_match:
            current_group = header_match.group(1)
            if current_group not in groups:
                groups[current_group] = []
            continue

        item_match = _ITEM_RE.match(raw_line)
        if item_match and current_group:
            item_spec = item_match.group(1)  # e.g. "minecraft:log:*" or "TConstruct:materials:9"
            item_raw = _normalise_item_raw(item_spec)
            item_key = _item_key(item_spec)   # lowercase "modid:itemname" (no meta)

            # Forward index
            if item_raw not in groups[current_group]:
                groups[current_group].append(item_raw)

            # Reverse index
            if item_key not in reverse:
                reverse[item_key] = []
            if current_group not in reverse[item_key]:
                reverse[item_key].append(current_group)

    return groups, reverse


def _read_lines(path: Path) -> list[str]:
    for encoding in ('utf-8', 'utf-8-sig', 'cp1251'):
        try:
            return path.read_text(encoding=encoding, errors='strict').splitlines()
        except (UnicodeDecodeError, LookupError):
            continue
    return path.read_text(encoding='utf-8', errors='replace').splitlines()


def _normalise_item_raw(item_spec: str) -> str:
    """Convert ``TConstruct:materials:9`` → ``<tconstruct:materials:9>``
    (lowercase, no wildcard normalisation — keep ``*`` as-is)."""
    return f'<{item_spec.lower()}>'


def _item_key(item_spec: str) -> str:
    """Extract ``modid:itemname`` (lowercase, drop meta / wildcard)."""
    parts = item_spec.lower().split(':')
    if len(parts) >= 2:
        return f'{parts[0]}:{parts[1]}'
    return item_spec.lower()
