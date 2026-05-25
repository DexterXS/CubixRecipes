from __future__ import annotations

from pathlib import Path

from app.indexer.asset_index import AssetIndex


def test_texture_png_is_indexed_without_reading_binary_content(tmp_path: Path, monkeypatch):
    texture_path = tmp_path / 'assets' / 'minecraft' / 'textures' / 'items' / 'stone.png'
    texture_path.parent.mkdir(parents=True)
    texture_path.write_bytes(b'not-a-real-png')

    original_read_bytes = Path.read_bytes

    def fail_on_png_read(path: Path) -> bytes:
        if path.suffix == '.png':
            raise AssertionError('png content should not be read during indexing')
        return original_read_bytes(path)

    monkeypatch.setattr(Path, 'read_bytes', fail_on_png_read)

    index = AssetIndex()
    index.scan_paths([str(tmp_path)])

    assert 'minecraft:stone' in index.icons
    assert not index.last_scan_report['scan_errors']
