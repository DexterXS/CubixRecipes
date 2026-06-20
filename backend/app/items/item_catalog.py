from __future__ import annotations

import csv
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from app.domain.models import ItemRef, MetaMode
from app.indexer.itempanel_icon_catalog import ItemPanelIconCatalog
from app.items.itempanel_nbt import ItemPanelNbtStack, read_itempanel_nbt, read_itempanel_nbt_bytes


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
    def __init__(self, csv_path: Path, nbt_path: Path, icon_catalog: ItemPanelIconCatalog) -> None:
        self.csv_path = csv_path
        self.nbt_path = nbt_path
        self.icon_catalog = icon_catalog
        self.entries: list[ItemCatalogEntry] = []
        self.last_scan_report: dict[str, object] = {
            'csv_path': str(csv_path),
            'nbt_path': str(nbt_path),
            'entries': 0,
            'csv_rows': 0,
            'csv_entries': 0,
            'nbt_items': 0,
            'nbt_entries': 0,
            'nbt_with_tags': 0,
            'matched_nbt_items': 0,
            'unmatched_nbt_items': 0,
            'enabled': False,
        }

    def scan(self, *, raise_on_nbt_error: bool = False) -> dict[str, object]:
        csv_entries, csv_rows = self._read_csv_entries()
        by_raw: dict[str, ItemCatalogEntry] = {}
        by_id_meta: dict[tuple[int, int], ItemCatalogEntry] = {}
        by_id: dict[int, list[ItemCatalogEntry]] = {}

        for entry in csv_entries:
            self._merge_entry(by_raw, entry)
            if entry.legacy_id is not None:
                by_id_meta[(entry.legacy_id, entry.meta)] = entry
                by_id.setdefault(entry.legacy_id, []).append(entry)

        nbt_items: list[ItemPanelNbtStack] = []
        nbt_error: Optional[str] = None
        try:
            nbt_items = read_itempanel_nbt(self.nbt_path)
        except Exception as exc:
            nbt_error = str(exc)
            if raise_on_nbt_error:
                raise

        matched_nbt = 0
        unmatched_nbt = 0
        nbt_entries = 0
        nbt_with_tags = 0

        for stack in nbt_items:
            csv_entry = self._match_nbt_stack(stack, by_id_meta, by_id)
            if csv_entry is None:
                unmatched_nbt += 1
                continue
            matched_nbt += 1
            if stack.nbt_raw:
                nbt_with_tags += 1
                nbt_entry = ItemCatalogEntry(
                    key=csv_entry.key,
                    legacy_id=stack.legacy_id,
                    meta=stack.meta,
                    has_nbt=True,
                    display_ru=csv_entry.display_ru,
                    display_en=csv_entry.display_en,
                    raw=build_item_raw(csv_entry.key, stack.meta, stack.nbt_raw),
                    nbt_raw=stack.nbt_raw,
                    has_icon=csv_entry.has_icon,
                    icon_url=csv_entry.icon_url,
                    sources={'csv', 'nbt'} | ({'icon'} if csv_entry.has_icon else set()),
                )
                before = len(by_raw)
                self._merge_entry(by_raw, nbt_entry)
                if len(by_raw) > before:
                    nbt_entries += 1
                continue
            base_raw = build_item_raw(csv_entry.key, stack.meta)
            base_entry = by_raw.get(base_raw)
            if base_entry is not None:
                base_entry.sources.add('nbt')

        self.entries = sorted(by_raw.values(), key=lambda item: (item.key, item.meta, item.raw or ''))
        self.last_scan_report = {
            'csv_path': str(self.csv_path),
            'nbt_path': str(self.nbt_path),
            'entries': len(self.entries),
            'csv_rows': csv_rows,
            'csv_entries': len(csv_entries),
            'nbt_items': len(nbt_items),
            'nbt_entries': nbt_entries,
            'nbt_with_tags': nbt_with_tags,
            'matched_nbt_items': matched_nbt,
            'unmatched_nbt_items': unmatched_nbt,
            'enabled': self.csv_path.is_file() or self.nbt_path.is_file(),
        }
        if nbt_error:
            self.last_scan_report['nbt_error'] = nbt_error
        return self.last_scan_report

    def upload_nbt(self, content: bytes) -> dict[str, object]:
        if not content.strip():
            raise ValueError('NBT file is empty')
        read_itempanel_nbt_bytes(content)
        self.nbt_path.parent.mkdir(parents=True, exist_ok=True)
        self.nbt_path.write_bytes(content)
        return self.scan(raise_on_nbt_error=True)

    def to_api(self) -> dict:
        return {
            'entries': [entry.to_api() for entry in self.entries],
            'summary': self.last_scan_report,
        }

    def _read_csv_entries(self) -> tuple[list[ItemCatalogEntry], int]:
        rows = self._read_csv_rows()
        entries: list[ItemCatalogEntry] = []
        for row in rows:
            key = self._field(row, 'Item Name', 'key').lower()
            display_ru = self._field(row, 'Display Name', 'display_ru')
            display_en = self._field(row, 'Display EN', 'display_en')
            primary_display = display_ru or display_en
            if not key or not primary_display or primary_display.strip() in {'-', '- '}:
                continue
            meta = self._parse_int(self._field(row, 'Item meta', 'meta'), default=0)
            legacy_id = self._parse_int(self._field(row, 'Item ID', 'id'), default=None)
            has_nbt = self._parse_bool(self._field(row, 'Has NBT', 'has_nbt'))
            has_icon = self._has_icon(key, meta)
            icon_url = self._icon_url(key, meta)
            sources = {'csv'} | ({'icon'} if has_icon else set())
            entries.append(ItemCatalogEntry(
                key=key,
                legacy_id=legacy_id,
                meta=meta,
                has_nbt=has_nbt,
                display_ru=display_ru or primary_display,
                display_en=display_en,
                has_icon=has_icon,
                icon_url=icon_url,
                sources=sources,
            ))
        return entries, len(rows)

    def _read_csv_rows(self) -> list[dict[str, str]]:
        if not self.csv_path.is_file():
            return []
        for encoding in ('utf-8-sig', 'cp1251', 'windows-1251'):
            try:
                with self.csv_path.open('r', encoding=encoding, newline='') as handle:
                    return list(csv.DictReader(handle))
            except UnicodeDecodeError:
                continue
        with self.csv_path.open('r', encoding='utf-8', errors='replace', newline='') as handle:
            return list(csv.DictReader(handle))

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

    def _match_nbt_stack(
        self,
        stack: ItemPanelNbtStack,
        by_id_meta: dict[tuple[int, int], ItemCatalogEntry],
        by_id: dict[int, list[ItemCatalogEntry]],
    ) -> ItemCatalogEntry | None:
        exact = by_id_meta.get((stack.legacy_id, stack.meta))
        if exact is not None:
            return exact
        zero = by_id_meta.get((stack.legacy_id, 0))
        if zero is not None:
            return zero
        candidates = by_id.get(stack.legacy_id)
        return candidates[0] if candidates else None

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

    def _parse_bool(self, value: str) -> bool:
        return str(value).strip().lower() in {'true', '1', 'yes', 'y'}


def build_item_raw(key: str, meta: int, nbt_raw: str | None = None) -> str:
    base = f'<{key}{f":{meta}" if meta > 0 else ""}>'
    normalized_nbt = (nbt_raw or '').strip()
    if not normalized_nbt:
        return base
    return f'{base}.withTag({normalized_nbt})'
