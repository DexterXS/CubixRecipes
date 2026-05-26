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


def test_search_by_ingredient(tmp_path: Path):
    scripts = tmp_path / 'scripts'
    scripts.mkdir()
    (scripts / 'sample.zs').write_text(SAMPLE, encoding='utf-8')
    storage = ZsStorage(scripts)
    storage.scan()
    assert len(storage.search_by_ingredient('<minecraft:planks>')) == 1
    assert len(storage.search_by_ingredient('<minecraft:planks:0>')) == 1
    assert len(storage.search_by_ingredient('<minecraft:stick>')) == 0


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
    assert len(storage.search_by_output('<minecraft:ladder>')) == 1
    assert len(storage.search_by_output('<minecraft:stick>')) == 0


def test_save_existing_rescans_only_changed_file(tmp_path: Path, monkeypatch):
    scripts = tmp_path / 'scripts'
    scripts.mkdir()
    file_path = scripts / 'sample.zs'
    file_path.write_text(SAMPLE, encoding='utf-8')
    storage = ZsStorage(scripts)
    storage.scan()
    uid = storage.search_by_output('<minecraft:stick>')[0].recipe_uid

    def fail_full_scan(*_args, **_kwargs):
        raise AssertionError('save_existing should not trigger a full recipe scan')

    monkeypatch.setattr(storage, 'scan', fail_full_scan)
    storage.save_existing(uid, 'recipes.addShaped(<minecraft:ladder>, [[<minecraft:stick>]]);')

    assert len(storage.search_by_output('<minecraft:ladder>')) == 1


def test_append_and_create_new_file(tmp_path: Path):
    scripts = tmp_path / 'scripts'
    storage = ZsStorage(scripts)
    storage.scan()
    target = scripts / 'newfile.zs'
    storage.create_file(str(target))
    uid = storage.save_as('recipes.addShaped(<minecraft:torch>, [[<minecraft:coal>]]);', str(target))
    assert uid
    assert '<minecraft:torch>' in target.read_text(encoding='utf-8')
    assert len(storage.search_by_output('<minecraft:torch>')) == 1


def test_save_as_rescans_only_target_file(tmp_path: Path, monkeypatch):
    scripts = tmp_path / 'scripts'
    storage = ZsStorage(scripts)
    storage.scan()
    target = scripts / 'newfile.zs'
    storage.create_file(str(target))

    def fail_full_scan(*_args, **_kwargs):
        raise AssertionError('save_as should not trigger a full recipe scan')

    monkeypatch.setattr(storage, 'scan', fail_full_scan)
    uid = storage.save_as('recipes.addShaped(<minecraft:torch>, [[<minecraft:coal>]]);', str(target))

    assert uid
    assert len(storage.search_by_output('<minecraft:torch>')) == 1


def test_rejects_writes_outside_allowed_recipe_roots(tmp_path: Path):
    scripts = tmp_path / 'scripts'
    scripts.mkdir()
    storage = ZsStorage(scripts)
    storage.scan()

    outside = tmp_path / 'outside.zs'
    with pytest.raises(ValueError):
        storage.create_file(str(outside))
