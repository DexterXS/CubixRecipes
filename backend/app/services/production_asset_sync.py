from __future__ import annotations

import csv
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urljoin
from urllib.request import Request, urlopen


SYNC_USER_AGENT = 'CubixRecipes-TestAssetSync/1.0'


def _fetch_bytes(url: str, timeout: int = 90) -> bytes:
    request = Request(url, headers={'Accept': '*/*', 'User-Agent': SYNC_USER_AGENT})
    with urlopen(request, timeout=timeout) as response:  # nosec B310 - base URL comes from Railway env
        return response.read()


def _fetch_json(url: str) -> Any:
    return json.loads(_fetch_bytes(url).decode('utf-8'))


def _safe_text(value: Any) -> str:
    return '' if value is None else str(value)


def _data_root() -> Path:
    configured = os.environ.get('CUBIXRECIPES_DATA_DIR', '').strip()
    if configured:
        return Path(configured)
    return Path('/data') if Path('/data').is_dir() else Path.cwd()


def _server_root(server_id: str) -> Path:
    return _data_root() / '.cubixrecipes_admin' / 'servers' / server_id


def _write_catalog_files(server_root: Path, entries: list[dict[str, Any]]) -> dict[str, int]:
    itempanel_dir = server_root / 'itempanel'
    itempanel_dir.mkdir(parents=True, exist_ok=True)

    fieldnames = ['key', 'id', 'meta', 'display_ru', 'display_en', 'nbt_raw']
    for filename in ('itempanel.csv', 'itempanel_merged.csv'):
        target = itempanel_dir / filename
        with target.open('w', encoding='utf-8-sig', newline='') as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            for entry in entries:
                writer.writerow({
                    'key': _safe_text(entry.get('key')),
                    'id': _safe_text(entry.get('legacy_id')),
                    'meta': int(entry.get('meta') or 0),
                    'display_ru': _safe_text(entry.get('display_ru')),
                    'display_en': _safe_text(entry.get('display_en')),
                    'nbt_raw': _safe_text(entry.get('nbt_raw')),
                })

    snbt_lines: list[str] = []
    for entry in entries:
        nbt_raw = _safe_text(entry.get('nbt_raw')).strip()
        if not nbt_raw:
            continue
        key = _safe_text(entry.get('key')).replace('"', '\\"')
        meta = int(entry.get('meta') or 0)
        snbt_lines.append(f'{{id:"{key}",Damage:{meta}s,tag:{nbt_raw}}}')
    (itempanel_dir / 'itempanel.json').write_text(
        ('\n'.join(snbt_lines) + '\n') if snbt_lines else '',
        encoding='utf-8-sig',
    )

    groups: dict[str, set[str]] = {}
    for entry in entries:
        key = _safe_text(entry.get('key')).strip().lower()
        if not key:
            continue
        meta = int(entry.get('meta') or 0)
        item_spec = f'{key}:{meta}' if meta else key
        for group in entry.get('ore_groups') or []:
            name = _safe_text(group).strip()
            if name:
                groups.setdefault(name, set()).add(item_spec)
    ore_lines: list[str] = []
    for group in sorted(groups, key=str.lower):
        ore_lines.append(f'Ore entries for <ore:{group}> :')
        for item_spec in sorted(groups[group]):
            ore_lines.append(f'    <{item_spec}>')
    (server_root / 'oredict.txt').write_text(
        ('\n'.join(ore_lines) + '\n') if ore_lines else '',
        encoding='utf-8',
    )

    return {'catalog_entries': len(entries), 'nbt_entries': len(snbt_lines), 'ore_groups': len(groups)}


def _write_itempanel_atlas(server_root: Path, base_url: str) -> dict[str, int]:
    manifest = _fetch_json(f'{base_url}/api/itempanel/atlas')
    png = _fetch_bytes(f'{base_url}/api/itempanel/atlas.png')
    cache_dir = server_root / 'itempanel'
    cache_dir.mkdir(parents=True, exist_ok=True)
    (cache_dir / 'production-atlas.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    (cache_dir / 'production-atlas.png').write_bytes(png)
    entries = manifest.get('entries') if isinstance(manifest, dict) else {}
    return {'itempanel_atlas_entries': len(entries or {}), 'itempanel_atlas_bytes': len(png)}


def _write_mod_atlases(server_root: Path, base_url: str) -> dict[str, int]:
    payload = _fetch_json(f'{base_url}/api/mod-icons/atlas')
    manifest = payload.get('manifest') if isinstance(payload, dict) and 'manifest' in payload else payload
    if not isinstance(manifest, dict):
        return {'mod_atlas_pages': 0, 'mod_atlas_bytes': 0}

    atlases_dir = server_root / 'mod_icon_atlases'
    atlases_dir.mkdir(parents=True, exist_ok=True)
    total_bytes = 0
    copied = 0
    for atlas in manifest.get('atlases') or []:
        if not isinstance(atlas, dict):
            continue
        filename = Path(_safe_text(atlas.get('file'))).name
        image_url = _safe_text(atlas.get('image_url')).strip()
        if not filename or not image_url:
            continue
        content = _fetch_bytes(urljoin(base_url + '/', image_url.lstrip('/')))
        (atlases_dir / filename).write_bytes(content)
        total_bytes += len(content)
        copied += 1

    (atlases_dir / 'mod-icons-atlas.json').write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
    )
    return {'mod_atlas_pages': copied, 'mod_atlas_bytes': total_bytes}


def sync_production_assets(server_id: str = 'hitech') -> dict[str, Any]:
    base_url = os.environ.get('ITEM_INTELLIGENCE_SOURCE_URL', '').strip().rstrip('/')
    if not base_url:
        return {'ok': False, 'skipped': True, 'reason': 'ITEM_INTELLIGENCE_SOURCE_URL is not configured'}

    server_root = _server_root(server_id)
    server_root.mkdir(parents=True, exist_ok=True)
    result: dict[str, Any] = {'ok': True, 'server_id': server_id, 'source': base_url}
    try:
        catalog = _fetch_json(f'{base_url}/api/itempanel/catalog')
        entries = catalog.get('entries') if isinstance(catalog, dict) else None
        if not isinstance(entries, list):
            raise ValueError('production catalog has no entries list')
        result.update(_write_catalog_files(server_root, entries))
        result.update(_write_itempanel_atlas(server_root, base_url))
        result.update(_write_mod_atlases(server_root, base_url))
        (server_root / 'production-asset-sync.json').write_text(
            json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8'
        )
        return result
    except Exception as exc:
        return {'ok': False, 'server_id': server_id, 'source': base_url, 'error': str(exc)}


def sync_on_startup() -> dict[str, Any] | None:
    enabled = os.environ.get('CUBIXRECIPES_SYNC_PRODUCTION_ASSETS', '').strip().lower()
    if enabled not in {'1', 'true', 'yes', 'on'}:
        return None
    server_id = os.environ.get('CUBIXRECIPES_SYNC_SERVER_ID', 'hitech').strip() or 'hitech'
    return sync_production_assets(server_id)
