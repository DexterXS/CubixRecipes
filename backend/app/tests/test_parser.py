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


def test_parse_extreme_recipe_with_escaped_whitespace_from_clipboard():
    parser = RecipeParser()
    text = r'''mods.avaritia.ExtremeCrafting.addShaped(<energyadditions:easolartype10>,\n	[[null, null, null, null, null, null, null, null, null],\n	[null, <Avaritia:Resource:5>, <energyadditions:eabeesolartype6>, <energyadditions:easolarp6>, <energyadditions:easolarp5>, <energyadditions:easolarp6>, <energyadditions:easolartype9>, <Avaritia:Resource:5>, null],\n	[null, <energyadditions:eabeesolartype6>, <gendustry:HoneyComb:515>, <cubixcollectors:compressedNeutroniumX3>, <energyadditions:eaenergysource>, <cubixcollectors:compressedNeutroniumX3>, <ExtraBees:honeyComb:26>, <energyadditions:easolartype9>, null],\n	[null, <AdvancedSolarPanel:asp_crafting_items:18>, <cubixcollectors:compressedNeutroniumX3>, <AdvancedSolarPanel:asp_crafting_items:14>, <energyadditions:eaadvmechbase>, <AdvancedSolarPanel:asp_crafting_items:14>, <cubixcollectors:compressedNeutroniumX3>, <AdvancedSolarPanel:asp_crafting_items:18>, null],\n	[null, <draconicrevolt:der_demonicblock:2>, <energyadditions:eakvantumcore:*>, <energyadditions:eaadvmechbase>, <ExtraUtilities:cobblestone_compressed:7>, <energyadditions:eaadvmechbase>, <energyadditions:eakvantumcore:*>, <draconicrevolt:der_demonicblock:2>, null],\n	[null, <AdvancedSolarPanel:asp_crafting_items:18>, <cubixcollectors:compressedNeutroniumX3>, <AdvancedSolarPanel:asp_crafting_items:14>, <energyadditions:eaadvmechbase>, <AdvancedSolarPanel:asp_crafting_items:14>, <cubixcollectors:compressedNeutroniumX3>, <AdvancedSolarPanel:asp_crafting_items:18>, null],\n	[null, <energyadditions:easolartype9>, <ExtraBees:honeyComb:26>, <cubixcollectors:compressedNeutroniumX3>, <energyadditions:eaenergysource>, <cubixcollectors:compressedNeutroniumX3>, <gendustry:HoneyComb:515>, <energyadditions:eadracsolartype6>, null],\n	[null, <Avaritia:Resource:5>, <energyadditions:easolartype9>, <draconicrevolt:der_demoniccore>, <energyadditions:eaadvmechbase>, <draconicrevolt:der_demoniccore>, <energyadditions:eadracsolartype6>, <Avaritia:Resource:5>, null],\n	[null, null, null, null, null, null, null, null, null]]);'''
    recipe = parser.parse(text).recipe
    assert recipe.recipe_type == 'avaritia_extreme_shaped'
    assert recipe.output.raw == '<energyadditions:easolartype10>'
    assert recipe.grid_w == 9
    assert recipe.grid_h == 9
    assert recipe.matrix[4][2].item.meta_mode == MetaMode.WILDCARD
    assert recipe.matrix[4][4].item.meta_value == 7
