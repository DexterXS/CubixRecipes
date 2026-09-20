from __future__ import annotations

import time
from pathlib import Path

from app.atlas.revision_service import AtlasRevisionService


PNG = b'\x89PNG\r\n\x1a\nrevision-test'


class FakeItemPanelCatalog:
    def get_atlas_manifest(self) -> dict:
        return {
            'revision': 'primary-source',
            'tile_size': 32,
            'columns': 1,
            'rows': 1,
            'entries': {
                '<example:item>': {
                    'item_key': 'example:item',
                    'meta': 0,
                    'display_name': 'Example',
                    'quality': 'good',
                    'x': 0,
                    'y': 0,
                    'w': 32,
                    'h': 32,
                }
            },
        }

    def read_atlas_png(self) -> bytes:
        return PNG


class FakeModIconService:
    def read_manifest(self) -> None:
        return None

    def read_atlas_png(self, filename: str) -> None:
        return None


def wait_for_status(service: AtlasRevisionService, revision: str, expected: str, active: bool = False) -> dict:
    for _ in range(100):
        status = service.build_status(revision)
        if status.get('status') == expected and (not active or status.get('active')):
            return status
        time.sleep(0.01)
    return service.build_status(revision)


def test_first_ready_build_becomes_active_and_keeps_revisioned_page(tmp_path: Path):
    service = AtlasRevisionService(tmp_path / 'atlas', 'test-server', FakeItemPanelCatalog(), FakeModIconService())

    started = service.start_build()
    revision = started['revision']
    ready = wait_for_status(service, revision, 'ready', active=True)

    assert ready['status'] == 'ready'
    assert service.read_active_meta()['activeRevision'] == revision
    assert service.read_candidates('<example:item>')[0]['source'] == 'primary'
    assert service.read_page('itempanel-atlas.png', revision) == PNG
    assert service.read_active_index()['candidates'][0]['columns'] == 1


def test_pages_are_not_served_before_ready_marker(tmp_path: Path):
    service = AtlasRevisionService(tmp_path / 'atlas', 'test-server', FakeItemPanelCatalog(), FakeModIconService())
    revision = 'rev-building'
    service.store.write_state(revision, {'revision': revision, 'status': 'building'})
    page_path = service.store.revision_path(revision) / 'pages'
    page_path.mkdir(parents=True)
    (page_path / 'itempanel-atlas.png').write_bytes(PNG)

    assert service.read_page('itempanel-atlas.png', revision) is None
