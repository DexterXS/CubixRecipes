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
