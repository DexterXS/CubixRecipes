from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / 'backend'
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.indexer.itempanel_icon_catalog import ItemPanelIconCatalog


def main() -> int:
    catalog = ItemPanelIconCatalog(ROOT_DIR / 'itempanel.csv', ROOT_DIR / 'itempanel_icons')
    catalog.scan()
    manifest = catalog.get_atlas_manifest()
    atlas_png = catalog.read_atlas_png()
    if atlas_png is None:
        raise RuntimeError('Itempanel atlas could not be generated')

    public_dir = ROOT_DIR / 'frontend' / 'public'
    public_dir.mkdir(parents=True, exist_ok=True)
    manifest = {**manifest, 'image_url': '/itempanel-atlas.png'}
    (public_dir / 'itempanel-atlas.json').write_text(json.dumps(manifest, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (public_dir / 'itempanel-atlas.png').write_bytes(atlas_png)
    print(f"Generated {len(manifest.get('entries', {}))} atlas entries")
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
