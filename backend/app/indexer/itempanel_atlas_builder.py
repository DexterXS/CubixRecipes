from __future__ import annotations

from threading import RLock
from typing import Any

from app.indexer.itempanel_atlas_cache import ItemPanelAtlasCache


class ItemPanelAtlasBuilder:
    """Build and persist the itempanel atlas for one server context."""

    def __init__(self, cache: ItemPanelAtlasCache) -> None:
        self.cache = cache
        self._lock = RLock()

    def ensure(self, catalog: Any) -> None:
        if catalog._atlas_manifest is not None:
            return
        with self._lock:
            self._ensure_locked(catalog)

    def _ensure_locked(self, catalog: Any) -> None:
        if catalog._atlas_manifest is not None:
            return

        source_key = self.cache.source_key(catalog.csv_path, catalog.icons_dir, catalog._icon_files)
        cached = self.cache.load(source_key)
        if cached is not None:
            catalog._atlas_manifest, catalog._atlas_png = cached
            return

        good_entries: list[Any] = []
        seen_files: set[str] = set()
        for entry in catalog.entries_by_key.values():
            if entry.icon_file in seen_files:
                continue
            if catalog._quality_for(entry.icon_file) != 'good_icon':
                continue
            seen_files.add(entry.icon_file)
            good_entries.append(entry)

        tile_size = 32
        empty_manifest = {
            'image_url': '/api/itempanel/atlas.png',
            'tile_size': tile_size,
            'columns': 0,
            'rows': 0,
            'entries': {},
        }
        if not good_entries:
            catalog._atlas_png = None
            catalog._atlas_manifest = empty_manifest
            return

        columns = min(64, max(1, self._ceil_sqrt(len(good_entries))))
        rows = (len(good_entries) + columns - 1) // columns
        atlas_width = columns * tile_size
        atlas_height = rows * tile_size
        atlas = bytearray(atlas_width * atlas_height * 4)
        file_rects: dict[str, dict[str, int]] = {}

        for index, entry in enumerate(good_entries):
            x = (index % columns) * tile_size
            y = (index // columns) * tile_size
            try:
                icon_width, icon_height, icon_rows = catalog._read_png_rgba(catalog.icons_dir / entry.icon_file)
            except Exception:
                continue
            icon_width, icon_height, icon_rows = catalog._trim_transparent_rgba(icon_width, icon_height, icon_rows)
            padding = 2
            target_size = max(1, tile_size - padding * 2)
            if icon_width > target_size or icon_height > target_size:
                icon_width, icon_height, icon_rows = catalog._resize_nearest_rgba(icon_width, icon_height, icon_rows, target_size)
            offset_x = x + (tile_size - icon_width) // 2
            offset_y = y + (tile_size - icon_height) // 2
            catalog._blit_rgba(atlas, atlas_width, icon_rows, icon_width, icon_height, offset_x, offset_y)
            file_rects[entry.icon_file] = {'x': x, 'y': y, 'w': tile_size, 'h': tile_size}

        manifest_entries: dict[str, dict] = {}
        for entry in catalog.entries_by_key.values():
            rect = file_rects.get(entry.icon_file)
            if rect is None:
                continue
            raw = catalog._build_raw(entry.item_key, entry.meta)
            manifest_entries[raw] = {
                **rect,
                'display_name': entry.display_name,
                'item_key': entry.item_key,
                'meta': entry.meta,
            }

        catalog._atlas_png = catalog._encode_rgba_png(atlas_width, atlas_height, atlas)
        catalog._atlas_manifest = {
            'image_url': '/api/itempanel/atlas.png',
            'tile_size': tile_size,
            'columns': columns,
            'rows': rows,
            'entries': manifest_entries,
        }
        self.cache.save(source_key, catalog._atlas_manifest, catalog._atlas_png)

    def _ceil_sqrt(self, value: int) -> int:
        root = 1
        while root * root < value:
            root += 1
        return root
