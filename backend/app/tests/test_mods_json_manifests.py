from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.indexer.asset_index import AssetIndex


REPO_ROOT = Path(__file__).resolve().parents[3]
MODS_JSON_DIR = REPO_ROOT / 'mods_json'


def _load_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding='utf-8'))


def _mods_with_textures() -> list[Path]:
    files: list[Path] = []
    for path in sorted(MODS_JSON_DIR.glob('*.json')):
        payload = _load_manifest(path)
        if not isinstance(payload, dict):
            continue
        tree = payload.get('tree')
        if not isinstance(tree, dict):
            continue
        textures, _ = AssetIndex()._collect_manifest_textures(tree)
        if textures:
            files.append(path)
    return files


@pytest.mark.parametrize('manifest_path', _mods_with_textures(), ids=lambda path: path.name)
def test_each_mod_manifest_with_textures_is_indexable(manifest_path: Path):
    payload = _load_manifest(manifest_path)
    tree = payload['tree']
    mod_path = payload.get('mod_path')
    index = AssetIndex()
    textures, mcmeta = index._collect_manifest_textures(tree)
    assert textures, f'Expected textures in {manifest_path.name}'

    report = {
        'counters': {'textures_items': 0, 'textures_blocks': 0, 'lang_entries': 0, 'models_item': 0},
        'registered_keys': [],
        'scan_errors': [],
    }
    source_report = {'registered_keys': [], 'errors': []}
    recognized = index._scan_mod_manifest(
        rel_path=manifest_path.name,
        data=json.dumps(payload).encode('utf-8'),
        source=str(manifest_path),
        source_report=source_report,
        report=report,
    )

    assert recognized is True
    assert not source_report['errors']
    assert isinstance(mod_path, str) and mod_path
    assert isinstance(mcmeta, set)
