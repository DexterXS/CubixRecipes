from pathlib import Path

import pytest

from app.storage.zs_storage import ZsStorage


SAMPLE = 'recipes.addShaped(<minecraft:stick>, [[<minecraft:planks>, null], [null, <minecraft:planks>]]);\n'


def test_search_by_output(tmp_path: Path):
    scripts = tmp_path / 'scripts'
    scripts.mkdir()
    (scripts / 'sample.zs').write_text(SAMPLE, encoding='utf-8')
    storage = ZsStorage(scripts)
    storage.scan()
    assert len(storage.search_by_output('<minecraft:stick>')) == 1
    assert len(storage.search_by_output('<minecraft:stick:0>')) == 1


def test_replace_existing_recipe(tmp_path: Path):
    scripts = tmp_path / 'scripts'
    scripts.mkdir()
    file_path = scripts / 'sample.zs'
    file_path.write_text(SAMPLE, encoding='utf-8')
    storage = ZsStorage(scripts)
    storage.scan()
    uid = storage.search_by_output('<minecraft:stick>')[0].recipe_uid
    storage.save_existing(uid, 'recipes.addShaped(<minecraft:ladder>, [[<minecraft:stick>]]);')
    assert '<minecraft:ladder>' in file_path.read_text(encoding='utf-8')


def test_append_and_create_new_file(tmp_path: Path):
    scripts = tmp_path / 'scripts'
    storage = ZsStorage(scripts)
    storage.scan()
    target = scripts / 'newfile.zs'
    storage.create_file(str(target))
    uid = storage.save_as('recipes.addShaped(<minecraft:torch>, [[<minecraft:coal>]]);', str(target))
    assert uid
    assert '<minecraft:torch>' in target.read_text(encoding='utf-8')


def test_rejects_writes_outside_allowed_recipe_roots(tmp_path: Path):
    scripts = tmp_path / 'scripts'
    scripts.mkdir()
    storage = ZsStorage(scripts)
    storage.scan()

    outside = tmp_path / 'outside.zs'
    with pytest.raises(ValueError):
        storage.create_file(str(outside))
