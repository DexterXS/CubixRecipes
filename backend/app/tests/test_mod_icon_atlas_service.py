from __future__ import annotations

import struct
import zlib
from pathlib import Path
from zipfile import ZipFile

from app.services.mod_icon_atlas_service import ModIconAtlasService


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


def test_mod_icon_atlas_packs_multiple_mods_into_shared_page(tmp_path: Path):
    source_icon = tmp_path / 'icon.png'
    _write_rgba_png(source_icon, [(255, 0, 0, 255), (0, 255, 0, 255), (0, 0, 255, 255), (255, 255, 0, 255)])
    archives_dir = tmp_path / 'archives'
    atlases_dir = tmp_path / 'atlases'
    archives_dir.mkdir()
    for modid, icon_name in [('firstmod', 'First icon.png'), ('secondmod', 'Second icon.png')]:
        archive_path = archives_dir / f'{modid}_x32.zip'
        with ZipFile(archive_path, 'w') as archive:
            archive.write(source_icon, f'{modid}_x32/{icon_name}')

    manifest = ModIconAtlasService(archives_dir, atlases_dir).generate_atlases()

    assert manifest['totalMods'] == 2
    assert len(manifest['atlases']) == 1
    assert manifest['atlases'][0]['file'] == 'mod-icons-x32-1.png'
    assert manifest['entries']['x32']['firstmod/First icon']['atlasFile'] == 'mod-icons-x32-1.png'
    assert manifest['entries']['x32']['secondmod/Second icon']['atlasFile'] == 'mod-icons-x32-1.png'
