from app.parsers.recipe_parser import RecipeParser
from app.services.recipe_service import RecipeService


def test_remove_template_wildcard_preserves_canonical_item_case():
    parser = RecipeParser()
    service = RecipeService(None, parser)
    recipe = parser.parse(
        'recipes.addShaped(<Avaritia:Resource:1>, [[<appliedenergistics2:item.ItemMultiMaterial:56>]]);'
    ).recipe

    rendered = service.render_remove_template('recipes.remove({output_wildcard});', recipe)

    assert rendered == 'recipes.remove(<Avaritia:Resource:*>);'


def test_recipe_render_strips_live_energy_nbt_from_ingredients():
    parser = RecipeParser()
    service = RecipeService(None, parser)
    source = (
        'recipes.addShaped(<minecraft:stone>, '
        '[[<appliedenergistics2:tile.BlockAdvancedCraftingUnit>, '
        '<cubix_ae:advanced_energy_cell>.withTag({internalMaxPower:1.28E7d,internalCurrentPower:1.28E7d}), '
        '<energyadditions:energyCell>.withTag({rfenergy:500000000,euenergy:500000000})]]);'
    )
    recipe = parser.parse(source).recipe

    rendered = service.render_recipe(recipe)

    assert '<minecraft:stone>' in rendered
    assert '<appliedenergistics2:tile.BlockAdvancedCraftingUnit>' in rendered
    assert '<cubix_ae:advanced_energy_cell:*>' in rendered
    assert '<energyadditions:energyCell:*>' in rendered
    assert '.withTag({rfenergy:500000000,euenergy:500000000})' not in rendered
    assert '.withTag({internalMaxPower:1.28E7d,internalCurrentPower:1.28E7d})' not in rendered


def test_recipe_render_preserves_non_energy_nbt():
    parser = RecipeParser()
    service = RecipeService(None, parser)
    source = (
        'recipes.addShaped(<minecraft:enchanted_book>, '
        '[[<minecraft:enchanted_book>.withTag({StoredEnchantments:[{lvl:3 as short,id:35 as short}]})]]);'
    )
    recipe = parser.parse(source).recipe

    rendered = service.render_recipe(recipe)

    assert '<minecraft:enchanted_book>.withTag({StoredEnchantments:[{lvl:3 as short,id:35 as short}]})' in rendered


def test_extreme_recipe_round_trip_preserves_mixed_case_ids():
    parser = RecipeParser()
    service = RecipeService(None, parser)
    row = '[<Avaritia:Resource:1>, <appliedenergistics2:item.ItemMultiMaterial:56>, <appliedenergistics2:tile.BlockAdvancedCraftingUnit>, null, null, null, null, null, null]'
    source = f'mods.avaritia.ExtremeCrafting.addShaped(<Avaritia:Resource:1>, [{row}, {row}, {row}, {row}, {row}, {row}, {row}, {row}, {row}]);'
    recipe = parser.parse(source).recipe

    rendered = service.render_recipe(recipe)

    assert rendered.count('<Avaritia:Resource:1>') == 10
    assert rendered.count('<appliedenergistics2:item.ItemMultiMaterial:56>') == 9
    assert rendered.count('<appliedenergistics2:tile.BlockAdvancedCraftingUnit>') == 9
