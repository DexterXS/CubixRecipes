from __future__ import annotations

import struct
import zlib
from pathlib import Path

from app.indexer.itempanel_icon_catalog import GOOD_ICON, MISSING_TEXTURE_ICON, ItemPanelIconCatalog
from app.parsers.recipe_parser import RecipeParser


def _write_rgba_png(path: Path, pixels: list[tuple[int, int, int, int]], width: int = 2) -> None:
    height = len(pixels) // width
    raw_rows = []
    for row in range(height):
        raw = bytearray()
        for r, g, b, a in pixels[row * width:(row + 1) * width]:
            raw.extend([r, g, b, a])
        raw_rows.append(b'\x00' + bytes(raw))
    payload = zlib.compress(b''.join(raw_rows))

    def chunk(name: bytes, data: bytes) -> bytes:
        body = name + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)

    path.write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', payload)
        + chunk(b'IEND', b'')
    )


def test_itempanel_catalog_resolves_good_icon(tmp_path: Path):
    icons_dir = tmp_path / 'itempanel_icons'
    icons_dir.mkdir()
    csv_path = tmp_path / 'itempanel.csv'
    csv_path.write_text('Item Name,Item ID,Item meta,Has NBT,Display Name\nminecraft:stone,1,0,false,Камень\n', encoding='cp1251')
    _write_rgba_png(icons_dir / 'Камень.png', [(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255)])

    catalog = ItemPanelIconCatalog(csv_path, icons_dir)
    catalog.scan()
    item = RecipeParser().parse_item_ref('<minecraft:stone>')
    result = catalog.resolve(item)

    assert result is not None
    assert result.strategy == 'itempanel_icon_catalog'
    assert result.icon_url is not None
    assert catalog.last_scan_report['matched'] == 1


def test_itempanel_catalog_marks_missing_texture_as_bad(tmp_path: Path):
    icons_dir = tmp_path / 'itempanel_icons'
    icons_dir.mkdir()
    csv_path = tmp_path / 'itempanel.csv'
    csv_path.write_text('Item Name,Item ID,Item meta,Has NBT,Display Name\nmod:tutorials,1,0,false,tutorials\n', encoding='cp1251')
    _write_rgba_png(icons_dir / 'tutorials.png', [(255, 0, 255, 255), (0, 0, 0, 255), (255, 0, 255, 255), (0, 0, 0, 255)])

    catalog = ItemPanelIconCatalog(csv_path, icons_dir)
    catalog.scan()
    item = RecipeParser().parse_item_ref('<mod:tutorials>')
    result = catalog.resolve(item)

    assert result is not None
    assert result.icon_url is None
    assert result.strategy == f'itempanel_{MISSING_TEXTURE_ICON}'


def test_itempanel_catalog_builds_atlas_without_pillow(tmp_path: Path):
    icons_dir = tmp_path / 'itempanel_icons'
    icons_dir.mkdir()
    csv_path = tmp_path / 'itempanel.csv'
    csv_path.write_text('Item Name,Item ID,Item meta,Has NBT,Display Name\nminecraft:stone,1,0,false,Stone\n', encoding='utf-8')
    _write_rgba_png(icons_dir / 'Stone.png', [(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255)])

    catalog = ItemPanelIconCatalog(csv_path, icons_dir)
    catalog.scan()
    manifest = catalog.get_atlas_manifest()
    atlas_png = catalog.read_atlas_png()

    assert manifest['entries']['<minecraft:stone>']['display_name'] == 'Stone'
    assert manifest['tile_size'] == 32
    assert atlas_png is not None
    assert atlas_png.startswith(b'\x89PNG\r\n\x1a\n')


def test_itempanel_atlas_centers_visible_pixels_instead_of_source_canvas(tmp_path: Path):
    icons_dir = tmp_path / 'itempanel_icons'
    icons_dir.mkdir()
    csv_path = tmp_path / 'itempanel.csv'
    csv_path.write_text('Item Name,Item ID,Item meta,Has NBT,Display Name\nminecraft:gem,1,0,false,Gem\n', encoding='utf-8')
    transparent = (0, 0, 0, 0)
    cyan = (0, 200, 255, 255)
    green = (0, 255, 120, 255)
    yellow = (255, 220, 0, 255)
    pixels = [transparent] * 16
    pixels[10] = cyan
    pixels[11] = green
    pixels[14] = yellow
    pixels[15] = cyan
    _write_rgba_png(icons_dir / 'Gem.png', pixels, width=4)

    catalog = ItemPanelIconCatalog(csv_path, icons_dir)
    catalog.scan()
    atlas_png = catalog.read_atlas_png()

    assert atlas_png is not None
    width, height, rows = catalog.read_png_rgba_bytes(atlas_png)
    assert (width, height) == (32, 32)
    assert rows[15][15 * 4:15 * 4 + 4] == bytes(cyan)
    assert rows[31][31 * 4:31 * 4 + 4] == bytes(transparent)
