from types import SimpleNamespace

from app.atlas.registry import AtlasRegistry


def test_registry_maps_x32_and_x256_zip_icons_to_catalog_raws():
    catalog = SimpleNamespace(entries=[
        SimpleNamespace(
            key='examplemod:iron_detector',
            meta=0,
            raw='<examplemod:iron_detector>',
            display_ru='Железный детектор',
            display_en='Iron Detector',
        )
    ])
    manifest = {
        'entries': {
            'x32': {
                'examplemod/iron_detector': {
                    'key': 'examplemod/iron_detector',
                    'modid': 'examplemod',
                    'iconName': 'iron_detector',
                    'size': 32,
                    'page': 1,
                    'atlasFile': 'mod-icons-x32-1.png',
                    'quality': 'good',
                    'x': 0,
                    'y': 0,
                    'w': 32,
                    'h': 32,
                }
            },
            'x256': {
                'examplemod/iron_detector': {
                    'key': 'examplemod/iron_detector',
                    'modid': 'examplemod',
                    'iconName': 'iron_detector',
                    'size': 256,
                    'page': 1,
                    'atlasFile': 'mod-icons-x256-1.png',
                    'quality': 'good',
                    'x': 0,
                    'y': 0,
                    'w': 256,
                    'h': 256,
                }
            },
        }
    }
    pages = {
        'mod-icons-x32-1.png': {
            'name': 'zip-mod-icons-x32-1.png',
            'url': '/api/atlas/v2/pages/zip-mod-icons-x32-1.png?revision=rev-1',
            'columns': 128,
            'rows': 1,
            'tileSize': 32,
        },
        'mod-icons-x256-1.png': {
            'name': 'zip-mod-icons-x256-1.png',
            'url': '/api/atlas/v2/pages/zip-mod-icons-x256-1.png?revision=rev-1',
            'columns': 16,
            'rows': 1,
            'tileSize': 256,
        },
    }

    candidates, stats = AtlasRegistry(catalog).map_zip_icons(manifest, 'rev-1', pages)

    assert {candidate['raw'] for candidate in candidates} == {'<examplemod:iron_detector>'}
    assert {candidate['size'] for candidate in candidates} == {32, 256}
    assert {candidate['page'] for candidate in candidates} == {
        'zip-mod-icons-x32-1.png',
        'zip-mod-icons-x256-1.png',
    }
    assert stats == {
        'catalogEntries': 1,
        'zipIcons': 2,
        'mappedZipIcons': 2,
        'unmappedZipIcons': 0,
        'mappedCandidates': 2,
    }
