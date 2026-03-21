from pathlib import Path

from app.api.routes import create_app


def test_save_as_accepts_generated_recipe(tmp_path: Path):
    app = create_app(str(tmp_path))
    save_as = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/recipes/save-as')

    response = save_as(
        type(
            'Request',
            (),
            {
                'recipe_uid': 'new-recipe',
                'recipe_type': 'ct_shaped',
                'output_raw': '<minecraft:torch>',
                'matrix': [['<minecraft:coal>', None], [None, '<minecraft:stick>']],
                'name': 'Torch Recipe',
                'target_path': str(tmp_path / 'saved.zs'),
            },
        )()
    )

    assert response['ok'] is True
    assert response['recipe']['name'] == 'Torch Recipe'
    assert response['recipe']['matrix'][0][0]['raw'] == '<minecraft:coal>'
    assert (tmp_path / 'saved.zs').read_text(encoding='utf-8').strip().startswith('recipes.addShaped("Torch Recipe"')


def test_update_existing_recipe_persists_changes(tmp_path: Path):
    recipe_file = tmp_path / 'recipes.zs'
    recipe_file.write_text('recipes.addShaped(<minecraft:torch>, [[<minecraft:coal>]]);\n', encoding='utf-8')
    app = create_app(str(tmp_path))
    search_route = next(route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/recipes/search')
    update_route = next(
        route.endpoint for route in app.routes if getattr(route, 'path', '') == '/api/recipes/{recipe_uid}' and 'PUT' in getattr(route, 'methods', set())
    )

    recipe_uid = search_route(type('SearchRequest', (), {'output_item_raw': '<minecraft:torch>'})())['matches'][0]['recipe_uid']
    response = update_route(
        recipe_uid,
        type(
            'UpdateRequest',
            (),
            {
                'recipe_type': 'ct_shaped',
                'output_raw': '<minecraft:torch>',
                'matrix': [['<minecraft:redstone>']],
                'name': None,
            },
        )(),
    )

    assert response['updatedRecipe']['matrix'][0][0]['raw'] == '<minecraft:redstone>'
    assert '<minecraft:redstone>' in recipe_file.read_text(encoding='utf-8')
