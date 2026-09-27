from __future__ import annotations

import re
from typing import Optional


ITEM_RAW_PATTERN = re.compile(
    r'^<([a-zA-Z0-9_.-]+:[a-zA-Z0-9_./-]+)(?::([0-9*]+))?>(?:\.withTag\(([\s\S]*)\))?$'
)

MUTABLE_ENERGY_KEYS = frozenset(
    {
        'charge',
        'currentenergy',
        'currentpower',
        'energy',
        'euenergy',
        'energystored',
        'energystoredrf',
        'internalcurrentpower',
        'internalmaxpower',
        'powerstored',
        'rfenergy',
        'storedenergy',
        'storedenergyrf',
    }
)


def normalize_recipe_script_item(raw: Optional[str]) -> Optional[str]:
    """Apply the recipe-script rule: never serialize live energy NBT."""
    if raw is None:
        return None
    trimmed = raw.strip()
    match = ITEM_RAW_PATTERN.fullmatch(trimmed)
    if not match or not match.group(3) or not _has_mutable_energy_key(match.group(3)):
        return trimmed
    return f'<{match.group(1)}:*>'


def _has_mutable_energy_key(nbt_raw: str) -> bool:
    for field in _split_top_level_fields(nbt_raw):
        separator = _find_top_level_separator(field, ':')
        if separator < 0:
            continue
        key = field[:separator].strip().strip('"\'').lower()
        if key in MUTABLE_ENERGY_KEYS:
            return True
    return False


def _split_top_level_fields(nbt_raw: str) -> list[str]:
    trimmed = nbt_raw.strip()
    body = trimmed[1:-1] if trimmed.startswith('{') and trimmed.endswith('}') else trimmed
    fields: list[str] = []
    start = 0
    curly_depth = 0
    square_depth = 0
    quote: Optional[str] = None
    escaped = False

    for index, char in enumerate(body):
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = None
            continue
        if char in {'"', "'"}:
            quote = char
            continue
        if char == '{':
            curly_depth += 1
        elif char == '}':
            curly_depth -= 1
        elif char == '[':
            square_depth += 1
        elif char == ']':
            square_depth -= 1
        elif char == ',' and curly_depth == 0 and square_depth == 0:
            fields.append(body[start:index].strip())
            start = index + 1

    last_field = body[start:].strip()
    if last_field:
        fields.append(last_field)
    return fields


def _find_top_level_separator(source: str, separator: str) -> int:
    curly_depth = 0
    square_depth = 0
    quote: Optional[str] = None
    escaped = False

    for index, char in enumerate(source):
        if escaped:
            escaped = False
            continue
        if char == '\\':
            escaped = True
            continue
        if quote:
            if char == quote:
                quote = None
            continue
        if char in {'"', "'"}:
            quote = char
            continue
        if char == '{':
            curly_depth += 1
        elif char == '}':
            curly_depth -= 1
        elif char == '[':
            square_depth += 1
        elif char == ']':
            square_depth -= 1
        elif char == separator and curly_depth == 0 and square_depth == 0:
            return index
    return -1
