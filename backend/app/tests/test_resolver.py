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
    result = resolver.resolve(item, {'fallback_to_first_variant_for_meta_miss': True})
    assert result.strategy == 'grouped_files'


def test_lang_lookup_strategy():
    index = AssetIndex()
    index.register_lang('ru_ru', {'item.mod.item': 'Предмет'})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<mod:item>')
    result = resolver.resolve(item, {'locale': 'ru_ru'})
    assert result.strategy == 'lang_lookup'
    assert result.display_name == 'Предмет'


def test_manual_override_takes_priority_over_indexed_icon():
    index = AssetIndex()
    index.register_icon('mod:item', {'asset_id': 'jar:icon1', 'path': 'assets/mod/textures/items/item.png', 'source_type': 'jar', 'animated': False})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<mod:item>')
    result = resolver.resolve(item, {'manual_overrides': {'<mod:item>': {'display_name': 'Override', 'icon_asset_id': 'custom:override', 'icon_url': '/api/icons/custom'}}})
    assert result.strategy == 'manual_override'
    assert result.icon_asset_id == 'custom:override'


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
    assert result.strategy in {'avaritia_meta_mapping', 'textures_meta_suffix', 'grouped_files'}
    assert result.icon_asset_id == 'jar:avaritia_resource_block_1'


def test_avaritia_resource_meta_maps_to_internal_subtype_texture():
    index = AssetIndex()
    index.register_icon('avaritia:resource_infinity_catalyst', {'asset_id': 'jar:avaritia_resource_infinity_catalyst', 'path': 'assets/avaritia/textures/items/resource_infinity_catalyst.png', 'source_type': 'jar', 'animated': False})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<Avaritia:Resource:5>')
    result = resolver.resolve(item)
    assert result.strategy == 'avaritia_meta_mapping'
    assert result.icon_asset_id == 'jar:avaritia_resource_infinity_catalyst'


def test_avaritia_singularity_meta_uses_shared_texture_and_lang_name():
    index = AssetIndex()
    index.register_icon('avaritia:singularity', {'asset_id': 'jar:avaritia_singularity', 'path': 'assets/avaritia/textures/items/singularity.png', 'source_type': 'jar', 'animated': False})
    index.register_lang('ru_ru', {'item.singularity_clay.name': 'Глиняная сингулярность'})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<Avaritia:Singularity:10>')
    result = resolver.resolve(item, {'locale': 'ru_ru'})
    assert result.strategy == 'avaritia_meta_mapping'
    assert result.icon_asset_id == 'jar:avaritia_singularity'
    assert result.display_name == 'Глиняная сингулярность'


def test_meta_ranked_candidate_supports_slash_variant():
    index = AssetIndex()
    index.register_icon('mod:backpacks/1', {'asset_id': 'jar:bp1', 'path': 'assets/mod/textures/items/backpacks/1.png', 'source_type': 'jar', 'animated': False})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<mod:backpacks:1>')
    result = resolver.resolve(item)
    assert result.strategy == 'textures_meta_suffix'
    assert result.icon_asset_id == 'jar:bp1'


def test_meta_miss_does_not_pick_grouped_variant_by_default():
    index = AssetIndex()
    index.register_icon('mod:item_1', {'asset_id': 'jar:item1', 'path': 'assets/mod/textures/items/item_1.png', 'source_type': 'jar', 'animated': False})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<mod:item:9>')
    result = resolver.resolve(item)
    assert result.strategy == 'placeholder'


def test_meta_miss_can_use_grouped_variant_when_enabled():
    index = AssetIndex()
    index.register_icon('mod:item_1', {'asset_id': 'jar:item1', 'path': 'assets/mod/textures/items/item_1.png', 'source_type': 'jar', 'animated': False})
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<mod:item:9>')
    result = resolver.resolve(item, {'fallback_to_first_variant_for_meta_miss': True})
    assert result.strategy == 'grouped_files'
    assert result.icon_asset_id == 'jar:item1'


def test_draconicrevolt_block_in_animated_subfolder_resolves_by_basename_alias():
    index = AssetIndex()
    report = {'counters': {'textures_items': 0, 'textures_blocks': 0, 'lang_entries': 0, 'models_item': 0}, 'registered_keys': [], 'scan_errors': []}
    source_report = {'registered_keys': [], 'errors': [], 'skipped_files': [], 'skipped_files_total': 0, 'indexed_files': 0}
    index._consume_virtual(
        rel_path='assets/draconicrevolt/textures/blocks/animated/der_awakeneddemonicblock.png',
        data=b'png',
        source='mock.jar',
        source_report=source_report,
        report=report,
        locator={'kind': 'archive_entry', 'archive_path': 'mock.jar', 'entry_path': 'assets/draconicrevolt/textures/blocks/animated/der_awakeneddemonicblock.png'},
    )
    resolver = ItemResolver(index)
    item = RecipeParser().parse_item_ref('<draconicrevolt:der_awakeneddemonicblock>')
    result = resolver.resolve(item)
    assert result.strategy == 'textures_exact'
    assert result.icon_asset_id is not None
