import base64
import sqlite3
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.api.routes import create_app
from app.services.shared_image_store import SharedImageStore


PNG_BYTES = b'\x89PNG\r\n\x1a\nshared-test-png'


def test_sync_deduplicates_bytes_and_persists_between_store_instances(tmp_path: Path):
    icons_dir = tmp_path / 'icons'
    icons_dir.mkdir()
    (icons_dir / 'first.png').write_bytes(PNG_BYTES)
    (icons_dir / 'second.png').write_bytes(PNG_BYTES)
    db_path = tmp_path / 'shared_images.db'

    first_store = SharedImageStore(db_path)
    first_store.sync_server_icons('one', icons_dir, ['first.png', 'second.png'])

    with sqlite3.connect(db_path) as connection:
        assert connection.execute('PRAGMA journal_mode').fetchone()[0].lower() == 'wal'
        assert connection.execute('SELECT COUNT(*) FROM image_assets').fetchone()[0] == 1

    assets = SharedImageStore(db_path).get_assets('one', ['first.png', 'second.png'])
    assert assets['first.png']['data'] == base64.b64encode(PNG_BYTES).decode('ascii')
    assert assets['first.png'] == assets['second.png'] | {'filename': 'first.png'}


def test_sync_skips_unchanged_file_and_updates_changed_file(tmp_path: Path, monkeypatch):
    icons_dir = tmp_path / 'icons'
    icons_dir.mkdir()
    icon_path = icons_dir / 'icon.png'
    icon_path.write_bytes(PNG_BYTES)
    store = SharedImageStore(tmp_path / 'shared_images.db')

    first = store.sync_server_icons('one', icons_dir, ['icon.png'])
    assert first['synced'] == 1

    original_read_bytes = Path.read_bytes
    monkeypatch.setattr(Path, 'read_bytes', lambda _path: pytest.fail('unchanged PNG was reread'))
    second = store.sync_server_icons('one', icons_dir, ['icon.png'])
    assert second['unchanged'] == 1
    monkeypatch.setattr(Path, 'read_bytes', original_read_bytes)

    changed = b'changed-png'
    icon_path.write_bytes(changed)
    third = store.sync_server_icons('one', icons_dir, ['icon.png'])
    assert third['synced'] == 1
    assert store.get_assets('one', ['icon.png'])['icon.png']['data'] == base64.b64encode(changed).decode('ascii')


def test_missing_image_is_not_returned(tmp_path: Path):
    icons_dir = tmp_path / 'icons'
    icons_dir.mkdir()
    (icons_dir / 'present.png').write_bytes(PNG_BYTES)
    store = SharedImageStore(tmp_path / 'shared_images.db')
    store.sync_server_icons('one', icons_dir, ['present.png', 'missing.png'])

    assert store.get_assets('one', ['present.png', 'missing.png']) == {
        'present.png': {
            'filename': 'present.png',
            'mime': 'image/png',
            'data': base64.b64encode(PNG_BYTES).decode('ascii'),
        }
    }


def test_fast_itempanel_page_filters_and_paginates(tmp_path: Path):
    icons_dir = tmp_path / 'itempanel_icons'
    icons_dir.mkdir()
    (tmp_path / 'itempanel.csv').write_text(
        'Item Name,Item ID,Item meta,Has NBT,Display Name\n'
        'mod:zeta,2,0,false,Zeta\n'
        'mod:alpha,1,0,false,Alpha\n'
        'mod:beta,3,1,false,Beta\n',
        encoding='utf-8',
    )
    for name in ('Zeta', 'Alpha', 'Beta'):
        (icons_dir / f'{name}.png').write_bytes(PNG_BYTES)

    app = create_app(config_path=str(tmp_path / 'cubixrecipes.config.json'))
    route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/fast-itempanel/page')

    first_page = route(page=1, limit=2, q='')
    filtered = route(page=1, limit=48, q='beta')

    assert [item['item_key'] for item in first_page['items']] == ['mod:alpha', 'mod:beta']
    assert first_page['total'] == 3
    assert first_page['source'] == 'shared-image-db'
    assert first_page['items'][0]['icon']['mime'] == 'image/png'
    assert filtered['total'] == 1
    assert filtered['items'][0]['display_name'] == 'Beta'
    assert filtered['items'][0]['raw'] == '<mod:beta:1>'

    (icons_dir / 'Beta.png').unlink()
    missing_icon = route(page=1, limit=48, q='beta')
    assert missing_icon['items'][0]['icon'] is None
    alpha_after_filter = route(page=1, limit=48, q='alpha')
    assert alpha_after_filter['items'][0]['icon'] is not None


@pytest.mark.parametrize('kwargs', [{'page': 0}, {'limit': 0}, {'limit': 97}])
def test_fast_itempanel_page_rejects_invalid_pagination(tmp_path: Path, kwargs: dict):
    (tmp_path / 'itempanel.csv').write_text(
        'Item Name,Item ID,Item meta,Has NBT,Display Name\n',
        encoding='utf-8',
    )
    (tmp_path / 'itempanel_icons').mkdir()
    app = create_app(config_path=str(tmp_path / 'cubixrecipes.config.json'))
    route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/fast-itempanel/page')

    with pytest.raises(HTTPException) as exc_info:
        route(**kwargs)
    assert exc_info.value.status_code == 422
