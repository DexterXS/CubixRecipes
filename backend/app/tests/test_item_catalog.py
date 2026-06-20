from __future__ import annotations

import csv
import struct
import zlib
from pathlib import Path

from app.items.item_catalog import ItemCatalogService
from app.indexer.itempanel_icon_catalog import ItemPanelIconCatalog


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


def test_item_catalog_merges_csv_and_itempanel_json_snbt(tmp_path: Path):
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
    snbt_path = tmp_path / 'itempanel.json'
    snbt_path.write_text('{id:475s,Count:1b,tag:{energy:0,mode:"charged"},Damage:0s}\n', encoding='utf-8-sig')
    icon_catalog = ItemPanelIconCatalog(csv_path, icons_dir)
    icon_catalog.scan()
    service = ItemCatalogService(csv_path, snbt_path, icon_catalog)

    before_merge = service.scan()
    assert before_merge['nbt_entries'] == 0

    merge_summary = service.merge_csv_and_snbt()
    payload = service.to_api()
    entries = {entry['raw']: entry for entry in payload['entries']}

    nbt_raw = '<mod:charged>.withTag({energy:0,mode:"charged"})'
    assert nbt_raw in entries
    assert '<mod:charged>' not in entries
    assert entries[nbt_raw]['has_nbt'] is True
    assert entries[nbt_raw]['nbt_raw'] == '{energy:0,mode:"charged"}'
    assert entries[nbt_raw]['icon_url']
    assert entries[nbt_raw]['sources'] == ['csv', 'icon', 'nbt']
    assert merge_summary['merged_rows'] == 1
    assert merge_summary['merged_nbt_rows'] == 1
    assert merge_summary['catalog']['nbt_entries'] == 1

    merged_csv = tmp_path / 'itempanel_merged.csv'
    assert merged_csv.is_file()
    with merged_csv.open('r', encoding='utf-8-sig', newline='') as handle:
        rows = list(csv.DictReader(handle))
    assert rows[0]['Item Name'] == 'mod:charged'
    assert rows[0]['SNBT Has NBT'] == 'true'
    assert rows[0]['ID Match'] == 'true'
    assert rows[0]['Meta Match'] == 'true'


def test_item_catalog_reads_combined_semicolon_csv_nbt_tags(tmp_path: Path):
    csv_path = tmp_path / 'super_itempanel.csv'
    csv_path.write_text(
        'index;item_name;item_id_csv;item_meta_csv;display_name_csv;has_nbt_csv;has_nbt_real;raw_tag_json_short\n'
        '465;AdvancedSolarPanel:advanced_solar_helmet;4302;1;Advanced Solar Helmet;true;True;"{""charge"":1000000.0}"\n'
        '466;AdvancedSolarPanel:advanced_solar_helmet;4302;27;Advanced Solar Helmet;false;False;{}\n',
        encoding='utf-8-sig',
    )
    icons_dir = tmp_path / 'itempanel_icons'
    icons_dir.mkdir()
    icon_catalog = ItemPanelIconCatalog(csv_path, icons_dir)
    icon_catalog.scan()
    service = ItemCatalogService(csv_path, tmp_path / 'missing_itempanel.json', icon_catalog)

    summary = service.scan()
    payload = service.to_api()
    entries = {entry['raw']: entry for entry in payload['entries']}
    nbt_raw = '<advancedsolarpanel:advanced_solar_helmet:1>.withTag({charge: 1000000.0})'

    assert nbt_raw in entries
    assert '<advancedsolarpanel:advanced_solar_helmet:27>' in entries
    assert '<advancedsolarpanel:advanced_solar_helmet:1>' not in entries
    assert entries[nbt_raw]['nbt_raw'] == '{charge: 1000000.0}'
    assert entries[nbt_raw]['has_nbt'] is True
    assert entries[nbt_raw]['sources'] == ['csv', 'nbt']
    assert summary['csv_entries'] == 2
    assert summary['csv_nbt_entries'] == 1
    assert summary['nbt_entries'] == 1


def test_item_catalog_does_not_treat_csv_has_nbt_flag_as_real_nbt(tmp_path: Path):
    csv_path = tmp_path / 'itempanel.csv'
    csv_path.write_text(
        'Item Name,Item ID,Item meta,Has NBT,Display Name\n'
        'mod:meta_only,475,1,true,Meta Only\n',
        encoding='utf-8',
    )
    icons_dir = tmp_path / 'itempanel_icons'
    icons_dir.mkdir()
    icon_catalog = ItemPanelIconCatalog(csv_path, icons_dir)
    icon_catalog.scan()
    service = ItemCatalogService(csv_path, tmp_path / 'missing_itempanel.json', icon_catalog)

    summary = service.scan()
    payload = service.to_api()
    entry = payload['entries'][0]

    assert summary['nbt_entries'] == 0
    assert entry['raw'] == '<mod:meta_only:1>'
    assert entry['nbt_raw'] is None
    assert entry['has_nbt'] is False
