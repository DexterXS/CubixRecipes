from __future__ import annotations

import re
import unicodedata
from pathlib import PurePosixPath
from typing import Any


class AtlasRegistry:
    """Builds one raw-item registry from catalog entries and ZIP atlas icons."""

    def __init__(self, item_catalog_service: Any | None = None) -> None:
        self.item_catalog_service = item_catalog_service

    def map_zip_icons(
        self,
        manifest: dict[str, Any],
        revision: str,
        pages_by_file: dict[str, dict[str, Any]],
    ) -> tuple[list[dict[str, Any]], dict[str, int]]:
        catalog_entries = self._catalog_entries()
        icons = self._icon_entries(manifest)
        groups = self._group_icons(icons)
        occurrence_by_label: dict[str, int] = {}
        candidates: list[dict[str, Any]] = []
        mapped_icon_ids: set[str] = set()

        for catalog_entry in catalog_entries:
            modid, item_path = catalog_entry['key'].split(':', 1)
            labels = self._catalog_labels(catalog_entry, item_path)
            selected: list[dict[str, Any]] | None = None
            for label in labels:
                label_key = f'{modid.casefold()}|{label}'
                label_groups = groups.get(label_key)
                if not label_groups:
                    continue
                group_index = occurrence_by_label.get(label_key, 0)
                identity = list(label_groups)[min(group_index, len(label_groups) - 1)]
                selected = label_groups.get(identity)
                occurrence_by_label[label_key] = group_index + 1
                break
            if not selected:
                continue

            for icon in sorted(selected, key=lambda item: int(item.get('size') or 32)):
                page_file = PurePosixPath(str(icon.get('atlasFile') or '')).name
                page = pages_by_file.get(page_file)
                if not page:
                    continue
                mapped_icon_ids.add(self._icon_record_identity(icon))
                candidates.append({
                    'raw': catalog_entry['raw'],
                    'key': catalog_entry['key'],
                    'meta': catalog_entry['meta'],
                    'quality': icon.get('quality'),
                    'source': 'zip',
                    'size': int(icon.get('size') or 32),
                    'revision': revision,
                    'page': page['name'],
                    'x': icon.get('x'),
                    'y': icon.get('y'),
                    'w': icon.get('w'),
                    'h': icon.get('h'),
                    'imageUrl': page['url'],
                    'displayName': icon.get('iconName') or icon.get('entryName'),
                    'columns': page.get('columns'),
                    'rows': page.get('rows'),
                    'tileSize': page.get('tileSize'),
                })

        return candidates, {
            'catalogEntries': len(catalog_entries),
            'zipIcons': len(icons),
            'mappedZipIcons': len(mapped_icon_ids),
            'unmappedZipIcons': max(0, len(icons) - len(mapped_icon_ids)),
            'mappedCandidates': len(candidates),
        }

    def _catalog_entries(self) -> list[dict[str, Any]]:
        result: list[dict[str, Any]] = []
        for entry in getattr(self.item_catalog_service, 'entries', []) or []:
            key = str(getattr(entry, 'key', '') or '').strip().lower()
            if ':' not in key:
                continue
            meta = int(getattr(entry, 'meta', 0) or 0)
            raw = str(getattr(entry, 'raw', '') or '').strip()
            if not raw:
                raw = f'<{key}{f":{meta}" if meta > 0 else ""}>'
            result.append({
                'key': key,
                'meta': meta,
                'raw': raw,
                'displayRu': str(getattr(entry, 'display_ru', '') or '').strip(),
                'displayEn': str(getattr(entry, 'display_en', '') or '').strip(),
            })
        return result

    def _icon_entries(self, manifest: dict[str, Any]) -> list[dict[str, Any]]:
        seen: set[str] = set()
        result: list[dict[str, Any]] = []
        entries_by_size = manifest.get('entries') or {}
        for size_key in ('x32', 'x256'):
            entries = entries_by_size.get(size_key) or {}
            if not isinstance(entries, dict):
                continue
            for entry in entries.values():
                if not isinstance(entry, dict):
                    continue
                identity = self._icon_identity(entry)
                dedupe_key = '|'.join([
                    str(entry.get('size') or (256 if size_key == 'x256' else 32)),
                    identity,
                    str(entry.get('atlasFile') or ''),
                    str(entry.get('page') or ''),
                    str(entry.get('x') or 0),
                    str(entry.get('y') or 0),
                ])
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)
                result.append(entry)
        return result

    def _group_icons(self, icons: list[dict[str, Any]]) -> dict[str, dict[str, list[dict[str, Any]]]]:
        groups: dict[str, dict[str, list[dict[str, Any]]]] = {}
        ordered = sorted(
            icons,
            key=lambda icon: (
                int(icon.get('size') or 32),
                self._duplicate_order(str(icon.get('iconName') or '')),
                str(icon.get('iconName') or '').casefold(),
            ),
        )
        for icon in ordered:
            modid = str(icon.get('modid') or '').casefold()
            label = self._base_label(str(icon.get('iconName') or icon.get('key') or icon.get('modid') or ''))
            if not modid or not label:
                continue
            label_groups = groups.setdefault(f'{modid}|{label}', {})
            label_groups.setdefault(self._icon_identity(icon), []).append(icon)
        return groups

    def _catalog_labels(self, entry: dict[str, Any], item_path: str) -> list[str]:
        labels = [
            entry.get('displayRu'),
            entry.get('displayEn'),
            PurePosixPath(item_path).name,
            item_path,
        ]
        return [normalized for value in labels if value and (normalized := self._normalize_label(str(value)))]

    @staticmethod
    def _icon_identity(icon: dict[str, Any]) -> str:
        return str(icon.get('key') or f"{icon.get('modid', '')}/{icon.get('iconName', '')}")

    @staticmethod
    def _icon_record_identity(icon: dict[str, Any]) -> str:
        return '|'.join([
            str(icon.get('size') or 32),
            AtlasRegistry._icon_identity(icon),
            str(icon.get('atlasFile') or ''),
            str(icon.get('page') or ''),
            str(icon.get('x') or 0),
            str(icon.get('y') or 0),
        ])

    @staticmethod
    def _duplicate_order(icon_name: str) -> int:
        match = re.search(r'_(\d+)$', PurePosixPath(icon_name).name)
        return int(match.group(1)) if match else 1

    @staticmethod
    def _base_label(icon_name: str) -> str:
        leaf = PurePosixPath(icon_name).name
        return AtlasRegistry._normalize_label(re.sub(r'_\d+$', '', leaf))

    @staticmethod
    def _normalize_label(value: str) -> str:
        normalized = unicodedata.normalize('NFKC', value or '').lower().replace('ё', 'е')
        normalized = re.sub(r'[_-]+', ' ', normalized)
        normalized = ''.join(char if char.isalnum() else ' ' for char in normalized)
        return re.sub(r'\s+', ' ', normalized).strip()
