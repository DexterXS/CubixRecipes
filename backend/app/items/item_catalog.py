from __future__ import annotations

import csv
import json
import re
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
    def __init__(self, csv_path: Path, nbt_path: Path, icon_catalog: ItemPanelIconCatalog, super_csv_path: Optional[Path] = None) -> None:
        self.csv_path = csv_path
        self.nbt_path = nbt_path
        self.super_csv_path = super_csv_path or csv_path.with_name('super_itempanel.csv')
        self.icon_catalog = icon_catalog
        self.entries: list[ItemCatalogEntry] = []
        self.last_scan_report: dict[str, object] = {
            'csv_path': str(csv_path),
            'nbt_path': str(nbt_path),
            'super_csv_path': str(self.super_csv_path),
            'super_csv_written': False,
            'super_csv_rows': 0,
            'super_csv_nbt_rows': 0,
            'entries': 0,
            'csv_rows': 0,
            'csv_entries': 0,
            'csv_nbt_entries': 0,
            'nbt_items': 0,
            'nbt_entries': 0,
            'nbt_with_tags': 0,
            'matched_nbt_items': 0,
            'unmatched_nbt_items': 0,
            'enabled': False,
        }

    def scan(self, *, raise_on_nbt_error: bool = False) -> dict[str, object]:
        csv_rows_data = self._read_csv_rows()
        csv_entries = self._csv_entries_from_rows(csv_rows_data)
        csv_rows = len(csv_rows_data)
        csv_nbt_entries = sum(1 for entry in csv_entries if entry.nbt_raw)
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
            exact_entry = by_id_meta.get((stack.legacy_id, stack.meta))
            csv_entry = exact_entry or self._match_nbt_stack(stack, by_id_meta, by_id)
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
                already_present = nbt_entry.raw in by_raw
                if exact_entry is not None:
                    by_raw.pop(build_item_raw(csv_entry.key, stack.meta), None)
                self._merge_entry(by_raw, nbt_entry)
                if not already_present:
                    nbt_entries += 1
                continue
            base_raw = build_item_raw(csv_entry.key, stack.meta)
            base_entry = by_raw.get(base_raw)
            if base_entry is not None:
                base_entry.sources.add('nbt')

        super_csv_report = self._write_super_itempanel_csv(csv_rows_data, nbt_items)
        self.entries = sorted(by_raw.values(), key=lambda item: (item.key, item.meta, item.raw or ''))
        self.last_scan_report = {
            'csv_path': str(self.csv_path),
            'nbt_path': str(self.nbt_path),
            'super_csv_path': str(self.super_csv_path),
            **super_csv_report,
            'entries': len(self.entries),
            'csv_rows': csv_rows,
            'csv_entries': len(csv_entries),
            'csv_nbt_entries': csv_nbt_entries,
            'nbt_items': len(nbt_items),
            'nbt_entries': nbt_entries + csv_nbt_entries,
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
            has_nbt = bool(nbt_raw) or self._parse_bool(self._field(row, 'Has NBT', 'has_nbt', 'has_nbt_csv', 'has_nbt_real'))
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

    def _write_super_itempanel_csv(self, rows: list[dict[str, str]], nbt_items: list[ItemPanelNbtStack]) -> dict[str, object]:
        report: dict[str, object] = {
            'super_csv_written': False,
            'super_csv_rows': 0,
            'super_csv_nbt_rows': 0,
        }
        if not rows or not nbt_items:
            return report
        fieldnames = [
            'index',
            'item_name',
            'item_id_csv',
            'item_meta_csv',
            'display_name_csv',
            'has_nbt_csv',
            'nbt_id',
            'nbt_damage',
            'meta_match',
            'count',
            'has_nbt_real',
            'tag_keys',
            'tag_modid',
            'tag_itemname',
            'tag_meta',
            'nbt_display_name',
            'fluid_name',
            'fluid_amount',
            'energy',
            'charge',
            'ench_count',
            'has_genome',
            'has_infitool',
            'raw_tag_json_short',
        ]
        try:
            self.super_csv_path.parent.mkdir(parents=True, exist_ok=True)
            nbt_rows = 0
            with self.super_csv_path.open('w', encoding='utf-8-sig', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=fieldnames, delimiter=';')
                writer.writeheader()
                for index, row in enumerate(rows, start=1):
                    stack = nbt_items[index - 1] if index - 1 < len(nbt_items) else None
                    nbt_info = self._super_nbt_info(stack)
                    if nbt_info['has_nbt_real']:
                        nbt_rows += 1
                    csv_id = self._field(row, 'Item ID', 'id', 'item_id', 'item_id_csv')
                    csv_meta = self._field(row, 'Item meta', 'meta', 'item_meta', 'item_meta_csv')
                    nbt_id = str(nbt_info['nbt_id'])
                    nbt_damage = str(nbt_info['nbt_damage'])
                    writer.writerow({
                        'index': index,
                        'item_name': self._field(row, 'Item Name', 'key', 'item_name'),
                        'item_id_csv': csv_id,
                        'item_meta_csv': csv_meta,
                        'display_name_csv': self._field(row, 'Display Name', 'display_ru', 'display_name', 'display_name_csv'),
                        'has_nbt_csv': self._field(row, 'Has NBT', 'has_nbt', 'has_nbt_csv'),
                        **nbt_info,
                        'meta_match': bool(csv_id and csv_meta and csv_id == nbt_id and csv_meta == nbt_damage),
                    })
            report.update({
                'super_csv_written': True,
                'super_csv_rows': len(rows),
                'super_csv_nbt_rows': nbt_rows,
            })
        except Exception as exc:
            report['super_csv_error'] = str(exc)
        return report

    def _super_nbt_info(self, stack: ItemPanelNbtStack | None) -> dict[str, object]:
        tag = stack.tag_json if stack is not None and isinstance(stack.tag_json, dict) else {}
        fluid = tag.get('Fluid') if isinstance(tag.get('Fluid'), dict) else {}
        display = tag.get('display') if isinstance(tag.get('display'), dict) else {}
        return {
            'nbt_id': stack.legacy_id if stack else '',
            'nbt_damage': stack.meta if stack else '',
            'count': stack.count if stack else '',
            'has_nbt_real': bool(tag),
            'tag_keys': ';'.join(sorted(str(key) for key in tag.keys())),
            'tag_modid': tag.get('modid', ''),
            'tag_itemname': tag.get('itemname', ''),
            'tag_meta': tag.get('meta', ''),
            'nbt_display_name': display.get('Name', ''),
            'fluid_name': fluid.get('FluidName', fluid.get('Name', '')),
            'fluid_amount': fluid.get('Amount', ''),
            'energy': tag.get('energy', tag.get('Energy', '')),
            'charge': tag.get('charge', ''),
            'ench_count': len(tag.get('ench', [])) if isinstance(tag.get('ench'), list) else '',
            'has_genome': 'Genome' in tag or 'genes' in tag or 'gene' in tag,
            'has_infitool': 'InfiTool' in tag,
            'raw_tag_json_short': self._short_json(tag),
        }

    def _short_json(self, value: object, *, limit: int = 1000) -> str:
        if value in (None, ''):
            return ''
        text = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
        if len(text) > limit:
            return text[:limit] + '...'
        return text

    def _read_csv_rows(self) -> list[dict[str, str]]:
        if not self.csv_path.is_file():
            return []
        for encoding in ('utf-8-sig', 'cp1251', 'windows-1251'):
            try:
                with self.csv_path.open('r', encoding=encoding, newline='') as handle:
                    return list(csv.DictReader(handle, delimiter=self._csv_delimiter(handle)))
            except UnicodeDecodeError:
                continue
        with self.csv_path.open('r', encoding='utf-8', errors='replace', newline='') as handle:
            return list(csv.DictReader(handle, delimiter=self._csv_delimiter(handle)))

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

    def _csv_nbt_raw(self, row: dict[str, str]) -> Optional[str]:
        raw = self._field(row, 'NBT Raw', 'nbt_raw', 'raw_tag_json_short')
        if not raw or raw in {'{}', '{ }'}:
            return None
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
