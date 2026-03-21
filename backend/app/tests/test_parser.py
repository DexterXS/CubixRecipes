from app.domain.models import MetaMode
from app.parsers.recipe_parser import RecipeParser


def test_parse_2x2_recipe():
    parser = RecipeParser()
    text = 'recipes.addShaped(<minecraft:stick> * 4, [[<minecraft:planks>, null], [null, <minecraft:planks>]]);'
    result = parser.parse(text)
    assert result.kind == 'recipe'
    assert result.recipe.output.raw == '<minecraft:stick>'
    assert result.recipe.grid_w == 2
    assert result.recipe.grid_h == 2
    assert result.recipe.matrix[0][1].raw is None


def test_parse_3x3_recipe():
    parser = RecipeParser()
    text = 'recipes.addShaped(<energyadditions:eaobsidiangenerator>, [[<energyadditions:eapowercircuit>, <energyadditions:eaenergysource>, <energyadditions:eapowercircuit>],[<DraconicEvolution:awakenedCore>, <thermal_additions:AdvancedMachine:7>, <DraconicEvolution:awakenedCore>],[<energyadditions:eapowercircuit>, <energyadditions:eaadvmechbase>, <energyadditions:eapowercircuit>]]);'
    recipe = parser.parse(text).recipe
    assert recipe.grid_w == 3
    assert recipe.output.raw == '<energyadditions:eaobsidiangenerator>'
    assert recipe.matrix[1][1].item.meta_value == 7


def test_parse_9x9_extreme_recipe():
    parser = RecipeParser()
    row = '[' + ', '.join(['<minecraft:stone>'] * 9) + ']'
    text = f'mods.avaritia.ExtremeCrafting.addShaped(<minecraft:glass>, [{", ".join([row] * 9)}]);'
    recipe = parser.parse(text).recipe
    assert recipe.recipe_type == 'avaritia_extreme_shaped'
    assert recipe.output.raw == '<minecraft:glass>'
    assert recipe.grid_h == 9
    assert recipe.grid_w == 9


def test_parse_meta_exact():
    parser = RecipeParser()
    item = parser.parse_item_ref('<minecraft:planks:2>')
    assert item.meta_mode == MetaMode.EXACT
    assert item.meta_value == 2


def test_parse_meta_wildcard():
    parser = RecipeParser()
    item = parser.parse_item_ref('<minecraft:planks:*>')
    assert item.meta_mode == MetaMode.WILDCARD


def test_parse_112_name_syntax():
    parser = RecipeParser()
    text = 'recipes.addShaped("CTLeggings", <minecraft:iron_leggings>, [[<minecraft:iron_ingot>, <minecraft:iron_ingot>, <minecraft:iron_ingot>],[<minecraft:iron_ingot>, null, <minecraft:iron_ingot>],[<minecraft:iron_ingot>, null, <minecraft:iron_ingot>]]);'
    recipe = parser.parse(text).recipe
    assert recipe.name == 'CTLeggings'
    assert recipe.output.raw == '<minecraft:iron_leggings>'
