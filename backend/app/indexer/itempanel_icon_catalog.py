from __future__ import annotations

import csv
import math
import re
import struct
import unicodedata
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Optional
from urllib.parse import quote

from app.domain.models import ItemRef, ResolutionResult


GOOD_ICON = 'good_icon'
TRANSPARENT_ICON = 'transparent_icon'
EMPTY_OR_BLACK_ICON = 'empty_or_black_icon'
MISSING_TEXTURE_ICON = 'missing_texture_icon'
UNSUPPORTED_ICON = 'unsupported_icon'
NO_ICON_FILE = 'no_icon_file'


@dataclass(frozen=True)
class ItemPanelIconEntry:
    item_key: str
    meta: Optional[int]
    display_name: str
    icon_file: str


class ItemPanelIconCatalog:
    def __init__(self, csv_path: Path, icons_dir: Path) -> None:
        self.csv_path = csv_path
        self.icons_dir = icons_dir
        self.entries_by_key: dict[tuple[str, Optional[int]], ItemPanelIconEntry] = {}
        self.quality_by_file: dict[str, str] = {}
        self._atlas_png: Optional[bytes] = None
        self._atlas_manifest: Optional[dict] = None
        self.last_scan_report = {
            'csv_path': str(csv_path),
            'icons_dir': str(icons_dir),
            'rows': 0,
            'icons': 0,
            'matched': 0,
            'missing': 0,
            'enabled': False,
        }

    def scan(self) -> None:
        self.entries_by_key.clear()
        self.quality_by_file.clear()
        self._atlas_png = None
        self._atlas_manifest = None
        icon_files = self._build_icon_file_map()
        rows = self._read_rows()
        matched = 0
        missing = 0
        for row in rows:
            item_key = str(row.get('Item Name', '')).strip().lower()
            display_name = str(row.get('Display Name', '')).strip()
            if not item_key or not display_name:
                continue
            meta = self._parse_meta(row.get('Item meta'))
            icon_file = icon_files.get(self._normalize_name(display_name))
            if icon_file is None:
                missing += 1
                continue
            matched += 1
            self.entries_by_key[(item_key, meta)] = ItemPanelIconEntry(
                item_key=item_key,
                meta=meta,
                display_name=display_name,
                icon_file=icon_file,
            )
        self.last_scan_report = {
            'csv_path': str(self.csv_path),
            'icons_dir': str(self.icons_dir),
            'rows': len(rows),
            'icons': len(icon_files),
            'matched': matched,
            'missing': missing,
            'enabled': self.csv_path.is_file() and self.icons_dir.is_dir(),
        }

    def resolve(self, item_ref: ItemRef) -> Optional[ResolutionResult]:
        entry = self._find_entry(item_ref)
        if entry is None:
            return None
        quality = self._quality_for(entry.icon_file)
        trace = [{'strategy': 'itempanel_icon_catalog', 'icon_file': entry.icon_file, 'quality': quality}]
        if quality != GOOD_ICON:
            return ResolutionResult(
                item_raw=item_ref.raw,
                display_name=entry.display_name,
                icon_asset_id=None,
                icon_url=None,
                animated=False,
                animation_meta=None,
                confidence=0.2,
                strategy=f'itempanel_{quality}',
                trace=trace,
            )
        icon_asset_id = f'itempanel|{entry.icon_file}'
        return ResolutionResult(
            item_raw=item_ref.raw,
            display_name=entry.display_name,
            icon_asset_id=icon_asset_id,
            icon_url=f"/api/icons/{quote(icon_asset_id, safe='')}",
            animated=False,
            animation_meta=None,
            confidence=0.98,
            strategy='itempanel_icon_catalog',
            trace=trace,
        )

    def read_icon(self, icon_asset_id: str) -> Optional[bytes]:
        prefix = 'itempanel|'
        if not icon_asset_id.startswith(prefix):
            return None
        icon_file = icon_asset_id[len(prefix):]
        path = (self.icons_dir / icon_file).resolve(strict=False)
        try:
            path.relative_to(self.icons_dir.resolve(strict=False))
        except ValueError:
            return None
        if not path.is_file():
            return None
        return path.read_bytes()

    def get_atlas_manifest(self) -> dict:
        self._ensure_atlas()
        return self._atlas_manifest or {
            'image_url': '/api/itempanel/atlas.png',
            'tile_size': 32,
            'columns': 0,
            'rows': 0,
            'entries': {},
        }

    def read_atlas_png(self) -> Optional[bytes]:
        self._ensure_atlas()
        return self._atlas_png

    def _ensure_atlas(self) -> None:
        if self._atlas_manifest is not None:
            return

        good_entries: list[ItemPanelIconEntry] = []
        seen_files: set[str] = set()
        for entry in self.entries_by_key.values():
            if entry.icon_file in seen_files:
                continue
            if self._quality_for(entry.icon_file) != GOOD_ICON:
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
            self._atlas_png = None
            self._atlas_manifest = empty_manifest
            return

        columns = min(64, max(1, math.ceil(math.sqrt(len(good_entries)))))
        rows = math.ceil(len(good_entries) / columns)
        atlas_width = columns * tile_size
        atlas_height = rows * tile_size
        atlas = bytearray(atlas_width * atlas_height * 4)
        file_rects: dict[str, dict[str, int]] = {}

        for index, entry in enumerate(good_entries):
            x = (index % columns) * tile_size
            y = (index // columns) * tile_size
            try:
                icon_width, icon_height, icon_rows = self._read_png_rgba(self.icons_dir / entry.icon_file)
            except Exception:
                continue
            icon_width, icon_height, icon_rows = self._trim_transparent_rgba(icon_width, icon_height, icon_rows)
            padding = 2
            target_size = max(1, tile_size - padding * 2)
            if icon_width > target_size or icon_height > target_size:
                icon_width, icon_height, icon_rows = self._resize_nearest_rgba(icon_width, icon_height, icon_rows, target_size)
            offset_x = x + (tile_size - icon_width) // 2
            offset_y = y + (tile_size - icon_height) // 2
            self._blit_rgba(atlas, atlas_width, icon_rows, icon_width, icon_height, offset_x, offset_y)
            file_rects[entry.icon_file] = {'x': x, 'y': y, 'w': tile_size, 'h': tile_size}

        manifest_entries: dict[str, dict] = {}
        for entry in self.entries_by_key.values():
            rect = file_rects.get(entry.icon_file)
            if rect is None:
                continue
            raw = self._build_raw(entry.item_key, entry.meta)
            manifest_entries[raw] = {
                **rect,
                'display_name': entry.display_name,
                'item_key': entry.item_key,
                'meta': entry.meta,
            }

        self._atlas_png = self._encode_rgba_png(atlas_width, atlas_height, atlas)
        self._atlas_manifest = {
            'image_url': '/api/itempanel/atlas.png',
            'tile_size': tile_size,
            'columns': columns,
            'rows': rows,
            'entries': manifest_entries,
        }

    def read_png_rgba_bytes(self, data: bytes) -> tuple[int, int, list[bytes]]:
        width, height, rows, channels, palette, alpha_palette = self._decode_png_bytes(data)
        if width <= 0 or height <= 0 or rows is None:
            raise ValueError('unsupported png')
        rgba_rows: list[bytes] = []
        if channels == 1:
            for row in rows:
                output = bytearray()
                for value in row:
                    r, g, b = palette[value] if palette and value < len(palette) else (value, value, value)
                    a = alpha_palette[value] if alpha_palette and value < len(alpha_palette) else 255
                    output.extend([r, g, b, a])
                rgba_rows.append(bytes(output))
            return width, height, rgba_rows
        if channels == 3:
            for row in rows:
                output = bytearray()
                for index in range(0, len(row), 3):
                    output.extend([row[index], row[index + 1], row[index + 2], 255])
                rgba_rows.append(bytes(output))
            return width, height, rgba_rows
        rgba_rows = [bytes(row) for row in rows]
        return width, height, rgba_rows

    def _read_png_rgba(self, path: Path) -> tuple[int, int, list[bytes]]:
        return self.read_png_rgba_bytes(path.read_bytes())

    def _trim_transparent_rgba(self, width: int, height: int, rows: list[bytes]) -> tuple[int, int, list[bytes]]:
        min_x = width
        min_y = height
        max_x = -1
        max_y = -1
        for y, row in enumerate(rows):
            for x in range(width):
                if row[x * 4 + 3] == 0:
                    continue
                min_x = min(min_x, x)
                min_y = min(min_y, y)
                max_x = max(max_x, x)
                max_y = max(max_y, y)
        if max_x < 0:
            return width, height, rows
        trimmed_rows = [row[min_x * 4:(max_x + 1) * 4] for row in rows[min_y:max_y + 1]]
        return max_x - min_x + 1, max_y - min_y + 1, trimmed_rows

    def _resize_nearest_rgba(self, width: int, height: int, rows: list[bytes], max_size: int) -> tuple[int, int, list[bytes]]:
        scale = min(max_size / width, max_size / height)
        next_width = max(1, int(width * scale))
        next_height = max(1, int(height * scale))
        resized: list[bytes] = []
        for y in range(next_height):
            source_y = min(height - 1, int(y / scale))
            source_row = rows[source_y]
            output = bytearray()
            for x in range(next_width):
                source_x = min(width - 1, int(x / scale))
                start = source_x * 4
                output.extend(source_row[start:start + 4])
            resized.append(bytes(output))
        return next_width, next_height, resized

    def _blit_rgba(self, atlas: bytearray, atlas_width: int, icon_rows: list[bytes], icon_width: int, icon_height: int, offset_x: int, offset_y: int) -> None:
        for y in range(icon_height):
            source_row = icon_rows[y]
            for x in range(icon_width):
                source_index = x * 4
                alpha = source_row[source_index + 3]
                if alpha == 0:
                    continue
                target_index = ((offset_y + y) * atlas_width + offset_x + x) * 4
                atlas[target_index:target_index + 4] = source_row[source_index:source_index + 4]

    def _encode_rgba_png(self, width: int, height: int, pixels) -> bytes:
        stride = width * 4
        raw_rows = [b'\x00' + bytes(pixels[row * stride:(row + 1) * stride]) for row in range(height)]
        payload = zlib.compress(b''.join(raw_rows))

        def chunk(name: bytes, data: bytes) -> bytes:
            body = name + data
            return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

        return (
            b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', payload)
            + chunk(b'IEND', b'')
        )

    def _find_entry(self, item_ref: ItemRef) -> Optional[ItemPanelIconEntry]:
        key = item_ref.base_key
        if item_ref.meta_value is not None:
            exact = self.entries_by_key.get((key, item_ref.meta_value))
            if exact is not None:
                return exact
        return self.entries_by_key.get((key, 0)) or self.entries_by_key.get((key, None))

    def _build_icon_file_map(self) -> dict[str, str]:
        if not self.icons_dir.is_dir():
            return {}
        result: dict[str, str] = {}
        for path in self.icons_dir.glob('*.png'):
            result.setdefault(self._normalize_name(path.stem), path.name)
        return result

    def _read_rows(self) -> list[dict[str, str]]:
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

    def _quality_for(self, icon_file: str) -> str:
        cached = self.quality_by_file.get(icon_file)
        if cached is not None:
            return cached
        quality = self._inspect_png(self.icons_dir / icon_file)
        self.quality_by_file[icon_file] = quality
        return quality

    def _inspect_png(self, path: Path) -> str:
        if not path.is_file():
            return NO_ICON_FILE
        try:
            width, height, rows, channels, palette, alpha_palette = self._decode_png(path)
        except Exception:
            return UNSUPPORTED_ICON
        if width <= 0 or height <= 0 or rows is None:
            return UNSUPPORTED_ICON

        visible = 0
        brightness = 0.0
        colors: set[tuple[int, int, int]] = set()
        magenta = 0
        dark = 0
        for row in rows:
            if channels == 1:
                for value in row:
                    r, g, b = palette[value] if palette and value < len(palette) else (value, value, value)
                    a = alpha_palette[value] if alpha_palette and value < len(alpha_palette) else 255
                    visible, brightness, magenta, dark = self._count_pixel(r, g, b, a, colors, visible, brightness, magenta, dark)
                continue
            for index in range(0, len(row), channels):
                r, g, b = row[index], row[index + 1], row[index + 2]
                a = row[index + 3] if channels == 4 else 255
                visible, brightness, magenta, dark = self._count_pixel(r, g, b, a, colors, visible, brightness, magenta, dark)
        if visible == 0:
            return TRANSPARENT_ICON
        avg_brightness = brightness / visible
        if magenta >= visible * 0.2 and dark >= visible * 0.2 and len(colors) <= 4:
            return MISSING_TEXTURE_ICON
        if avg_brightness < 2 or len(colors) <= 2:
            return EMPTY_OR_BLACK_ICON
        return GOOD_ICON

    def _count_pixel(
        self,
        r: int,
        g: int,
        b: int,
        a: int,
        colors: set[tuple[int, int, int]],
        visible: int,
        brightness: float,
        magenta: int,
        dark: int,
    ) -> tuple[int, float, int, int]:
        if a == 0:
            return visible, brightness, magenta, dark
        visible += 1
        brightness += (r + g + b) / 3
        if len(colors) <= 8:
            colors.add((r, g, b))
        if r > 180 and b > 180 and g < 80:
            magenta += 1
        if r < 40 and g < 40 and b < 40:
            dark += 1
        return visible, brightness, magenta, dark

    def _decode_png(self, path: Path):
        return self._decode_png_bytes(path.read_bytes())

    def _decode_png_bytes(self, data: bytes):
        if not data.startswith(b'\x89PNG\r\n\x1a\n'):
            raise ValueError('not a png')
        pos = 8
        width = height = bit_depth = color_type = None
        compressed = b''
        palette: list[tuple[int, int, int]] = []
        alpha_palette: list[int] = []
        while pos < len(data):
            length = struct.unpack('>I', data[pos:pos + 4])[0]
            chunk_type = data[pos + 4:pos + 8]
            chunk = data[pos + 8:pos + 8 + length]
            pos += 12 + length
            if chunk_type == b'IHDR':
                width, height, bit_depth, color_type = struct.unpack('>IIBB', chunk[:10])[:4]
            elif chunk_type == b'PLTE':
                palette = [(chunk[i], chunk[i + 1], chunk[i + 2]) for i in range(0, len(chunk), 3)]
            elif chunk_type == b'tRNS':
                alpha_palette = list(chunk)
            elif chunk_type == b'IDAT':
                compressed += chunk
            elif chunk_type == b'IEND':
                break
        if bit_depth != 8 or color_type not in (2, 3, 6):
            return width or 0, height or 0, None, 0, palette, alpha_palette
        channels = 1 if color_type == 3 else 4 if color_type == 6 else 3
        stride = (width or 0) * channels
        decoded = zlib.decompress(compressed)
        rows = self._unfilter_rows(decoded, width or 0, height or 0, channels, stride)
        return width or 0, height or 0, rows, channels, palette, alpha_palette

    def _unfilter_rows(self, decoded: bytes, width: int, height: int, channels: int, stride: int) -> list[bytes]:
        rows = []
        previous = bytearray(stride)
        offset = 0
        for _ in range(height):
            filter_type = decoded[offset]
            offset += 1
            scanline = bytearray(decoded[offset:offset + stride])
            offset += stride
            for index in range(stride):
                left = scanline[index - channels] if index >= channels else 0
                up = previous[index]
                up_left = previous[index - channels] if index >= channels else 0
                if filter_type == 1:
                    scanline[index] = (scanline[index] + left) & 255
                elif filter_type == 2:
                    scanline[index] = (scanline[index] + up) & 255
                elif filter_type == 3:
                    scanline[index] = (scanline[index] + ((left + up) // 2)) & 255
                elif filter_type == 4:
                    prediction = left + up - up_left
                    distances = (abs(prediction - left), abs(prediction - up), abs(prediction - up_left))
                    predictor = left if distances[0] <= distances[1] and distances[0] <= distances[2] else up if distances[1] <= distances[2] else up_left
                    scanline[index] = (scanline[index] + predictor) & 255
            rows.append(bytes(scanline))
            previous = scanline
        return rows

    def _parse_meta(self, raw: object) -> Optional[int]:
        try:
            return int(str(raw).strip())
        except (TypeError, ValueError):
            return None

    def _normalize_name(self, value: str) -> str:
        normalized = unicodedata.normalize('NFKC', value or '').strip().lower().replace('ё', 'е')
        return re.sub(r'\s+', ' ', normalized)

    def _build_raw(self, item_key: str, meta: Optional[int]) -> str:
        if meta is None or meta == 0:
            return f'<{item_key}>'
        return f'<{item_key}:{meta}>'
