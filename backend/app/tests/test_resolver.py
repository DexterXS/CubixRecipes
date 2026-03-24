from app.indexer.asset_index import AssetIndex
from app.parsers.recipe_parser import RecipeParser
from app.resolver.item_resolver import ItemResolver


def test_contenttweaker_strategy():
    index = AssetIndex()
    index.register_icon('mod:item', {'asset_id': 'contenttweaker:icon', 'path': 'icons/item.png', 'source_type': 'contenttweaker', 'animated': False})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<mod:item>')
    result = resolver.resolve(item)
    assert result.strategy == 'contenttweaker_exact'
    assert result.confidence == 0.95


def test_meta_suffix_strategy():
    index = AssetIndex()
    index.register_icon('mod:item_2', {'asset_id': 'jar:icon2', 'path': 'assets/mod/textures/items/item_2.png', 'source_type': 'jar', 'animated': False})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<mod:item:2>')
    result = resolver.resolve(item)
    assert result.strategy == 'textures_meta_suffix'


def test_grouped_files_strategy():
    index = AssetIndex()
    index.register_icon('mod:compressor1', {'asset_id': 'jar:icon1', 'path': 'assets/mod/textures/items/compressor1.png', 'source_type': 'jar', 'animated': False})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<mod:compressor:3>')
    result = resolver.resolve(item)
    assert result.strategy == 'grouped_files'


def test_lang_lookup_strategy():
    index = AssetIndex()
    index.register_lang('ru_ru', {'item.mod.item': 'Предмет'})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<mod:item>')
    result = resolver.resolve(item, {'locale': 'ru_ru'})
    assert result.strategy == 'lang_lookup'
    assert result.display_name == 'Предмет'


def test_invalid_model_texture_reference_does_not_crash_resolution():
    index = AssetIndex()
    index.register_model('mod:item', {'textures': {'layer0': '#missing'}})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<mod:item>')
    result = resolver.resolve(item)
    assert result.strategy == 'placeholder'
    assert result.icon_url is None


def test_uppercase_item_key_matches_lowercase_icon_index():
    index = AssetIndex()
    index.register_icon('avaritia:resource_block_1', {'asset_id': 'jar:avaritia_resource_block_1', 'path': 'assets/avaritia/textures/items/resource_block_1.png', 'source_type': 'jar', 'animated': False})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<Avaritia:Resource_Block:1>')
    result = resolver.resolve(item)
    assert result.strategy in {'textures_meta_suffix', 'grouped_files'}
    assert result.icon_asset_id == 'jar:avaritia_resource_block_1'


def test_scan_supports_singular_item_texture_folder(tmp_path):
    textures_dir = tmp_path / 'assets' / 'examplemod' / 'textures' / 'item'
    textures_dir.mkdir(parents=True)
    (textures_dir / 'seed.png').write_bytes(b'png')
    index = AssetIndex()
    index.scan_paths([str(tmp_path)])

    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<examplemod:seed>')
    result = resolver.resolve(item)
    assert result.icon_asset_id is not None
    assert result.strategy == 'textures_exact'


def test_scan_registers_nested_texture_aliases_from_mod_parser(tmp_path):
    textures_dir = tmp_path / 'assets' / 'contenttweaker' / 'textures' / 'items' / 'item'
    textures_dir.mkdir(parents=True)
    (textures_dir / 'bot_photonium.png').write_bytes(b'png')
    index = AssetIndex()
    index.scan_paths([str(tmp_path)])

    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<contenttweaker:bot_photonium>')
    result = resolver.resolve(item)
    assert result.icon_asset_id is not None
