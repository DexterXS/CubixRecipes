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


def test_recipe_round_trip_preserves_mixed_case_ids_and_nbt():
    parser = RecipeParser()
    service = RecipeService(None, parser)
    source = (
        'recipes.addShaped(<Avaritia:Resource:1>, '
        '[[<appliedenergistics2:tile.BlockAdvancedCraftingUnit>, '
        '<cubix_ae:advanced_energy_cell>.withTag({internalMaxPower:1.28E7d,internalCurrentPower:1.28E7d})]]);'
    )
    recipe = parser.parse(source).recipe

    rendered = service.render_recipe(recipe)

    assert '<Avaritia:Resource:1>' in rendered
    assert '<appliedenergistics2:tile.BlockAdvancedCraftingUnit>' in rendered
    assert '<cubix_ae:advanced_energy_cell>.withTag({internalMaxPower:1.28E7d,internalCurrentPower:1.28E7d})' in rendered


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
