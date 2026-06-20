from __future__ import annotations

import csv
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


CSV_ENCODINGS = ('cp1251', 'utf-8-sig', 'windows-1251')
SNBT_ENCODING = 'utf-8-sig'
MERGED_ENCODING = 'utf-8-sig'

MERGED_EXTRA_FIELDS = [
    'SNBT',
    'SNBT ID',
    'SNBT Damage',
    'SNBT Has NBT',
    'ID Match',
    'Meta Match',
]


@dataclass(frozen=True)
class ItemPanelMergeReport:
    csv_rows: int
    snbt_rows: int
    merged_rows: int
    merged_nbt_rows: int
    id_mismatch_rows: int
    meta_mismatch_rows: int
    merged_csv_path: str

    def to_dict(self) -> dict[str, object]:
        return {
            'csv_rows': self.csv_rows,
            'snbt_rows': self.snbt_rows,
            'merged_rows': self.merged_rows,
            'merged_nbt_rows': self.merged_nbt_rows,
            'id_mismatch_rows': self.id_mismatch_rows,
            'meta_mismatch_rows': self.meta_mismatch_rows,
            'merged_csv_path': self.merged_csv_path,
            'merged_csv_written': True,
        }


def read_csv_rows(file_path: Path) -> tuple[list[dict[str, str]], list[str]]:
    if not file_path.is_file():
        raise ValueError('itempanel.csv is not uploaded')
    last_error: Optional[Exception] = None
    for encoding in CSV_ENCODINGS:
        try:
            with file_path.open('r', encoding=encoding, errors='strict', newline='') as handle:
                reader = csv.DictReader(handle)
                return list(reader), list(reader.fieldnames or [])
        except UnicodeDecodeError as exc:
            last_error = exc
    with file_path.open('r', encoding='utf-8', errors='replace', newline='') as handle:
        reader = csv.DictReader(handle)
        rows = list(reader)
        fieldnames = list(reader.fieldnames or [])
    if last_error and not fieldnames:
        raise ValueError(str(last_error)) from last_error
    return rows, fieldnames


def read_snbt_lines(file_path: Path) -> list[str]:
    if not file_path.is_file():
        raise ValueError('itempanel.json is not uploaded')
    return read_snbt_lines_from_text(file_path.read_text(encoding=SNBT_ENCODING, errors='replace'))


def read_snbt_lines_from_text(text: str) -> list[str]:
    return [line.strip() for line in text.splitlines() if line.strip()]


def extract_top_level_id(snbt: str) -> int | str:
    match = re.search(r'^\{id:(-?\d+)s', snbt)
    if match:
        return int(match.group(1))
    return ''


def extract_top_level_damage(snbt: str) -> int | str:
    match = re.search(r',Damage:(-?\d+)s\}$', snbt)
    if match:
        return int(match.group(1))
    return ''


def has_nbt_tag(snbt: str) -> bool:
    return bool(extract_tag_snbt(snbt))


def extract_tag_snbt(snbt: str) -> str | None:
    for key, value in _top_level_fields(snbt):
        if key == 'tag' and value.strip() not in {'', '{}', '{ }'}:
            return value.strip()
    return None


def merge_itempanel_csv_with_snbt(csv_file: Path, snbt_file: Path, output_file: Path) -> dict[str, object]:
    rows, fieldnames = read_csv_rows(csv_file)
    snbt_lines = read_snbt_lines(snbt_file)

    if not fieldnames:
        raise ValueError('CSV-файл пустой или не содержит заголовков.')
    if len(rows) != len(snbt_lines):
        raise ValueError(f'Количество строк не совпадает: CSV={len(rows)}, JSON/SNBT={len(snbt_lines)}')

    output_fieldnames = [*fieldnames]
    for field in MERGED_EXTRA_FIELDS:
        if field not in output_fieldnames:
            output_fieldnames.append(field)

    merged_nbt_rows = 0
    id_mismatch_rows = 0
    meta_mismatch_rows = 0

    for index, row in enumerate(rows):
        snbt = snbt_lines[index]
        snbt_id = extract_top_level_id(snbt)
        snbt_damage = extract_top_level_damage(snbt)
        snbt_has_nbt = has_nbt_tag(snbt)
        csv_id = _safe_int(row.get('Item ID'))
        csv_meta = _safe_int(row.get('Item meta'))
        id_match = csv_id == snbt_id
        meta_match = csv_meta == snbt_damage
        if snbt_has_nbt:
            merged_nbt_rows += 1
        if not id_match:
            id_mismatch_rows += 1
        if not meta_match:
            meta_mismatch_rows += 1
        row['SNBT'] = snbt
        row['SNBT ID'] = snbt_id
        row['SNBT Damage'] = snbt_damage
        row['SNBT Has NBT'] = str(snbt_has_nbt).lower()
        row['ID Match'] = str(id_match).lower()
        row['Meta Match'] = str(meta_match).lower()

    output_file.parent.mkdir(parents=True, exist_ok=True)
    with output_file.open('w', encoding=MERGED_ENCODING, errors='replace', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=output_fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    return ItemPanelMergeReport(
        csv_rows=len(rows),
        snbt_rows=len(snbt_lines),
        merged_rows=len(rows),
        merged_nbt_rows=merged_nbt_rows,
        id_mismatch_rows=id_mismatch_rows,
        meta_mismatch_rows=meta_mismatch_rows,
        merged_csv_path=str(output_file),
    ).to_dict()


def _safe_int(value: object, default: int = 0) -> int:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return default


def _top_level_fields(snbt: str) -> list[tuple[str, str]]:
    trimmed = snbt.strip()
    if not (trimmed.startswith('{') and trimmed.endswith('}')):
        return []
    fields: list[tuple[str, str]] = []
    for chunk in _split_top_level(trimmed[1:-1], ','):
        key_value = _split_top_level_key_value(chunk)
        if key_value is not None:
            fields.append(key_value)
    return fields


def _split_top_level(source: str, delimiter: str) -> list[str]:
    parts: list[str] = []
    depth_curly = 0
    depth_square = 0
    quote: str | None = None
    escape = False
    start = 0
    for index, char in enumerate(source):
        if escape:
            escape = False
            continue
        if char == '\\':
            escape = True
            continue
        if quote:
            if char == quote:
                quote = None
            continue
        if char in {'"', "'"}:
            quote = char
            continue
        if char == '{':
            depth_curly += 1
        elif char == '}':
            depth_curly -= 1
        elif char == '[':
            depth_square += 1
        elif char == ']':
            depth_square -= 1
        if char == delimiter and depth_curly == 0 and depth_square == 0:
            parts.append(source[start:index].strip())
            start = index + 1
    parts.append(source[start:].strip())
    return [part for part in parts if part]


def _split_top_level_key_value(source: str) -> tuple[str, str] | None:
    depth_curly = 0
    depth_square = 0
    quote: str | None = None
    escape = False
    for index, char in enumerate(source):
        if escape:
            escape = False
            continue
        if char == '\\':
            escape = True
            continue
        if quote:
            if char == quote:
                quote = None
            continue
        if char in {'"', "'"}:
            quote = char
            continue
        if char == '{':
            depth_curly += 1
        elif char == '}':
            depth_curly -= 1
        elif char == '[':
            depth_square += 1
        elif char == ']':
            depth_square -= 1
        if char == ':' and depth_curly == 0 and depth_square == 0:
            return source[:index].strip().strip('"').strip("'"), source[index + 1:].strip()
    return None
