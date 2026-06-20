from __future__ import annotations

import gzip
import struct
import zlib
from pathlib import Path

from app.indexer.itempanel_icon_catalog import ItemPanelIconCatalog
from app.items.item_catalog import ItemCatalogService


def _name(value: str) -> bytes:
    raw = value.encode('utf-8')
    return struct.pack('>H', len(raw)) + raw


def _tag(tag_type: int, name: str, payload: bytes) -> bytes:
    return bytes([tag_type]) + _name(name) + payload


def _short(value: int) -> bytes:
    return struct.pack('>h', value)


def _int(value: int) -> bytes:
    return struct.pack('>i', value)


def _byte(value: int) -> bytes:
    return struct.pack('>b', value)


def _string(value: str) -> bytes:
    raw = value.encode('utf-8')
    return struct.pack('>H', len(raw)) + raw


def _compound(tags: list[bytes]) -> bytes:
    return b''.join(tags) + b'\x00'


def _item_stack(legacy_id: int, damage: int, tag_payload: bytes | None = None) -> bytes:
    tags = [
        _tag(2, 'id', _short(legacy_id)),
        _tag(1, 'Count', _byte(1)),
        _tag(2, 'Damage', _short(damage)),
    ]
    if tag_payload is not None:
        tags.append(_tag(10, 'tag', tag_payload))
    return _compound(tags)


def _write_itempanel_nbt(path: Path) -> None:
    item_tag = _compound([
        _tag(3, 'energy', _int(0)),
        _tag(8, 'mode', _string('charged')),
    ])
    stacks = [
        _item_stack(475, 0, item_tag),
        _item_stack(999, 0, None),
    ]
    list_payload = bytes([10]) + struct.pack('>i', len(stacks)) + b''.join(stacks)
    root = bytes([10]) + _name('') + _tag(9, 'list', list_payload) + b'\x00'
    path.write_bytes(gzip.compress(root))


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


def test_item_catalog_merges_csv_and_itempanel_nbt(tmp_path: Path):
    csv_path = tmp_path / 'itempanel.csv'
    csv_path.write_text(
        'Item Name,Item ID,Item meta,Has NBT,Display Name\n'
        'mod:charged,475,0,false,Charged Cell\n',
        encoding='utf-8',
    )
    icons_dir = tmp_path / 'itempanel_icons'
    icons_dir.mkdir()
    _write_rgba_png(
        icons_dir / 'Charged Cell.png',
        [(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255)],
    )
    nbt_path = tmp_path / 'itempanel.nbt'
    _write_itempanel_nbt(nbt_path)
    icon_catalog = ItemPanelIconCatalog(csv_path, icons_dir)
    icon_catalog.scan()
    service = ItemCatalogService(csv_path, nbt_path, icon_catalog)

    summary = service.scan()
    payload = service.to_api()
    entries = {entry['raw']: entry for entry in payload['entries']}

    assert '<mod:charged>' in entries
    assert '<mod:charged>.withTag({energy: 0, mode: "charged"})' in entries
    assert entries['<mod:charged>']['icon_url']
    assert entries['<mod:charged>.withTag({energy: 0, mode: "charged"})']['has_nbt'] is True
    assert entries['<mod:charged>.withTag({energy: 0, mode: "charged"})']['icon_url'] == entries['<mod:charged>']['icon_url']
    assert entries['<mod:charged>.withTag({energy: 0, mode: "charged"})']['sources'] == ['csv', 'icon', 'nbt']
    assert summary['nbt_items'] == 2
    assert summary['matched_nbt_items'] == 1
    assert summary['unmatched_nbt_items'] == 1
