from __future__ import annotations

import csv
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.domain.models import ItemRef, MetaMode
from app.indexer.itempanel_icon_catalog import ItemPanelIconCatalog
from app.items.itempanel_merge import (
    extract_tag_snbt,
    merge_itempanel_csv_with_snbt,
    read_snbt_lines,
    read_snbt_lines_from_text,
)


@dataclass
class ItemCatalogEntry:
    key: str
    legacy_id: Optional[int]
    meta: int
    has_nbt: bool
    display_ru: str
    display_en: str = ''
    raw: Optional[str] = None
    nbt_raw: Optional[str] = None
    has_icon: bool = False
    icon_url: Optional[str] = None
    sources: set[str] = field(default_factory=set)

    def to_api(self) -> dict:
        return {
            'key': self.key,
            'legacy_id': self.legacy_id,
            'meta': self.meta,
            'has_nbt': self.has_nbt,
            'display_ru': self.display_ru,
            'display_en': self.display_en,
            'raw': self.raw or build_item_raw(self.key, self.meta, self.nbt_raw),
            'nbt_raw': self.nbt_raw,
            'has_icon': self.has_icon,
            'icon_url': self.icon_url,
            'sources': sorted(self.sources),
        }


class ItemCatalogService:
    def __init__(self, csv_path: Path, snbt_path: Path, icon_catalog: ItemPanelIconCatalog, merged_csv_path: Optional[Path] = None) -> None:
        self.csv_path = csv_path
        self.snbt_path = snbt_path
        self.merged_csv_path = merged_csv_path or csv_path.with_name('itempanel_merged.csv')
        self.icon_catalog = icon_catalog
        self.entries: list[ItemCatalogEntry] = []
        self.last_scan_report: dict[str, object] = {
            'csv_path': str(csv_path),
            'snbt_path': str(snbt_path),
            'merged_csv_path': str(self.merged_csv_path),
            'merged_csv_exists': False,
            'merged_csv_written': False,
            'merged_rows': 0,
            'merged_nbt_rows': 0,
            'entries': 0,
            'csv_rows': 0,
            'snbt_rows': 0,
            'csv_entries': 0,
            'csv_nbt_entries': 0,
            'nbt_entries': 0,
            'enabled': False,
        }

    def scan(self) -> dict[str, object]:
        source_csv_path = self._catalog_csv_path()
        csv_rows_data = self._read_csv_rows(source_csv_path)
        csv_entries = self._csv_entries_from_rows(csv_rows_data)
        csv_rows = len(csv_rows_data)
        csv_nbt_entries = sum(1 for entry in csv_entries if entry.nbt_raw)
        by_raw: dict[str, ItemCatalogEntry] = {}

        for entry in csv_entries:
            self._merge_entry(by_raw, entry)

        snbt_rows = self._count_snbt_rows()
        self.entries = sorted(by_raw.values(), key=lambda item: (item.key, item.meta, item.raw or ''))
        self.last_scan_report = {
            'csv_path': str(self.csv_path),
            'snbt_path': str(self.snbt_path),
            'merged_csv_path': str(self.merged_csv_path),
            'catalog_csv_path': str(source_csv_path),
            'merged_csv_exists': self.merged_csv_path.is_file(),
            'merged_csv_written': False,
            'merged_rows': csv_rows if source_csv_path == self.merged_csv_path else 0,
            'merged_nbt_rows': csv_nbt_entries if source_csv_path == self.merged_csv_path else 0,
            'entries': len(self.entries),
            'csv_rows': csv_rows,
            'snbt_rows': snbt_rows,
            'csv_entries': len(csv_entries),
            'csv_nbt_entries': csv_nbt_entries,
            'nbt_entries': csv_nbt_entries,
            'enabled': self.csv_path.is_file() or self.merged_csv_path.is_file(),
        }
        return self.last_scan_report

    def upload_snbt_json(self, content: bytes) -> dict[str, object]:
        if not content.strip():
            raise ValueError('itempanel.json is empty')
        text = content.decode('utf-8-sig', errors='replace')
        lines = read_snbt_lines_from_text(text)
        if not lines:
            raise ValueError('itempanel.json does not contain SNBT lines')
        self.snbt_path.parent.mkdir(parents=True, exist_ok=True)
        self.snbt_path.write_text('\n'.join(lines) + '\n', encoding='utf-8-sig')
        self.invalidate_merged()
        summary = self.scan()
        summary['uploaded_snbt_rows'] = len(lines)
        return summary

    def merge_csv_and_snbt(self) -> dict[str, object]:
        merge_report = merge_itempanel_csv_with_snbt(self.csv_path, self.snbt_path, self.merged_csv_path)
        catalog_summary = self.scan()
        return {**merge_report, 'catalog': catalog_summary}

    def read_merged_csv_bytes(self) -> bytes:
        if not self.merged_csv_path.is_file():
            raise FileNotFoundError('itempanel_merged.csv is not generated')
        return self.merged_csv_path.read_bytes()

    def invalidate_merged(self) -> None:
        if self.merged_csv_path.is_file():
            self.merged_csv_path.unlink()

    def to_api(self) -> dict:
        return {
            'entries': [entry.to_api() for entry in self.entries],
            'summary': self.last_scan_report,
        }

    def _read_csv_entries(self) -> tuple[list[ItemCatalogEntry], int]:
        rows = self._read_csv_rows(self._catalog_csv_path())
        return self._csv_entries_from_rows(rows), len(rows)

    def _csv_entries_from_rows(self, rows: list[dict[str, str]]) -> list[ItemCatalogEntry]:
        entries: list[ItemCatalogEntry] = []
        for row in rows:
            key = self._field(row, 'Item Name', 'key', 'item_name').lower()
            display_ru = self._field(row, 'Display Name', 'display_ru', 'display_name', 'display_name_csv')
            display_en = self._field(row, 'Display EN', 'display_en')
            primary_display = display_ru or display_en
            if not key or not primary_display or primary_display.strip() in {'-', '- '}:
                continue
            meta = self._parse_int(self._field(row, 'Item meta', 'meta', 'item_meta', 'item_meta_csv'), default=0)
            legacy_id = self._parse_int(self._field(row, 'Item ID', 'id', 'item_id', 'item_id_csv'), default=None)
            nbt_raw = self._csv_nbt_raw(row)
            has_nbt = bool(nbt_raw)
            has_icon = self._has_icon(key, meta)
            icon_url = self._icon_url(key, meta)
            sources = {'csv'} | ({'icon'} if has_icon else set()) | ({'nbt'} if nbt_raw else set())
            entries.append(ItemCatalogEntry(
                key=key,
                legacy_id=legacy_id,
                meta=meta,
                has_nbt=has_nbt,
                display_ru=display_ru or primary_display,
                display_en=display_en,
                raw=build_item_raw(key, meta, nbt_raw) if nbt_raw else None,
                nbt_raw=nbt_raw,
                has_icon=has_icon,
                icon_url=icon_url,
                sources=sources,
            ))
        return entries

    def _catalog_csv_path(self) -> Path:
        return self.merged_csv_path if self.merged_csv_path.is_file() else self.csv_path

    def _read_csv_rows(self, path: Path) -> list[dict[str, str]]:
        if not path.is_file():
            return []
        for encoding in ('utf-8-sig', 'cp1251', 'windows-1251'):
            try:
                with path.open('r', encoding=encoding, newline='') as handle:
                    return list(csv.DictReader(handle, delimiter=self._csv_delimiter(handle)))
            except UnicodeDecodeError:
                continue
        with path.open('r', encoding='utf-8', errors='replace', newline='') as handle:
            return list(csv.DictReader(handle, delimiter=self._csv_delimiter(handle)))

    def _count_snbt_rows(self) -> int:
        try:
            return len(read_snbt_lines(self.snbt_path))
        except Exception:
            return 0

    def _csv_delimiter(self, handle) -> str:
        sample = handle.read(4096)
        handle.seek(0)
        try:
            return csv.Sniffer().sniff(sample, delimiters=',;\t').delimiter
        except csv.Error:
            return ','

    def _merge_entry(self, by_raw: dict[str, ItemCatalogEntry], entry: ItemCatalogEntry) -> None:
        raw = entry.raw or build_item_raw(entry.key, entry.meta, entry.nbt_raw)
        current = by_raw.get(raw)
        if current is None:
            entry.raw = raw
            by_raw[raw] = entry
            return
        current.sources.update(entry.sources)
        current.has_icon = current.has_icon or entry.has_icon
        current.has_nbt = current.has_nbt or entry.has_nbt
        current.icon_url = current.icon_url or entry.icon_url
        if not current.nbt_raw:
            current.nbt_raw = entry.nbt_raw

    def _has_icon(self, key: str, meta: int) -> bool:
        return (
            (key, meta) in self.icon_catalog.entries_by_key
            or (key, 0) in self.icon_catalog.entries_by_key
            or (key, None) in self.icon_catalog.entries_by_key
        )

    def _icon_url(self, key: str, meta: int) -> Optional[str]:
        parts = key.split(':', 1)
        if len(parts) != 2:
            return None
        item_ref = ItemRef(
            raw=build_item_raw(key, meta),
            modid=parts[0],
            name=parts[1],
            meta_mode=MetaMode.EXACT,
            meta_value=meta,
        )
        result = self.icon_catalog.resolve(item_ref)
        return result.icon_url if result else None

    def _field(self, row: dict[str, str], *names: str) -> str:
        lower = {key.lower(): value for key, value in row.items() if key is not None}
        for name in names:
            value = row.get(name)
            if value is None:
                value = lower.get(name.lower())
            if value is not None:
                return str(value).replace('\r', '').replace('\\n', '').strip()
        return ''

    def _parse_int(self, value: str, *, default: Optional[int]) -> Optional[int]:
        try:
            return int(str(value).strip())
        except (TypeError, ValueError):
            return default

    def _csv_nbt_raw(self, row: dict[str, str]) -> Optional[str]:
        raw = self._field(row, 'NBT Raw', 'nbt_raw', 'raw_tag_json_short')
        if not raw or raw in {'{}', '{ }'}:
            snbt = self._field(row, 'SNBT', 'snbt')
            if not snbt:
                return None
            return extract_tag_snbt(snbt)
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return raw if raw.startswith('{') and raw.endswith('}') else None
        if not parsed:
            return None
        return self._render_nbt_value(parsed)

    def _render_nbt_value(self, value) -> str:
        if isinstance(value, dict):
            return '{' + ', '.join(f'{self._render_nbt_key(key)}: {self._render_nbt_value(child)}' for key, child in value.items()) + '}'
        if isinstance(value, list):
            return '[' + ', '.join(self._render_nbt_value(child) for child in value) + ']'
        if isinstance(value, bool):
            return 'true' if value else 'false'
        if value is None:
            return 'null'
        if isinstance(value, (int, float)):
            return str(value)
        return json.dumps(str(value), ensure_ascii=False)

    def _render_nbt_key(self, key: object) -> str:
        text = str(key)
        if re.match(r'^[A-Za-z_][A-Za-z0-9_./-]*$', text):
            return text
        return json.dumps(text, ensure_ascii=False)


def build_item_raw(key: str, meta: int, nbt_raw: str | None = None) -> str:
    base = f'<{key}{f":{meta}" if meta > 0 else ""}>'
    normalized_nbt = (nbt_raw or '').strip()
    if not normalized_nbt:
        return base
    return f'{base}.withTag({normalized_nbt})'
