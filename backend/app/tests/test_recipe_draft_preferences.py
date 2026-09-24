import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.api.routes import create_app
from app.api.schemas import RecipeDraftPreferencesRequest
from app.storage.recipe_draft_preferences import RecipeDraftPreferencesStore


def _auth_request(email: str, role: str = 'default'):
    return type(
        'Request',
        (),
        {'state': type('State', (), {'auth_user': {'email': email, 'role': role, 'is_root_admin': False}})()},
    )()


def _route(app, path: str, method: str):
    return next(
        route.endpoint
        for route in app.routes
        if getattr(route, 'path', '') == path and method in getattr(route, 'methods', set())
    )


def _create_test_app(tmp_path: Path):
    (tmp_path / 'itempanel.csv').write_text(
        'Item Name,Item ID,Item meta,Has NBT,Display Name\n'
        'minecraft:stone,1,0,false,Stone\n',
        encoding='utf-8',
    )
    return create_app(config_path=str(tmp_path / 'cubixrecipes.config.json'))


def test_recipe_draft_preferences_return_defaults_for_new_user(tmp_path: Path):
    app = _create_test_app(tmp_path)
    get_route = _route(app, '/api/recipe-drafts/preferences', 'GET')

    assert get_route(_auth_request('User@Example.com')) == {'sortMode': 'date-desc', 'groupMode': 'none'}


def test_recipe_draft_preferences_save_to_server_file(tmp_path: Path):
    app = _create_test_app(tmp_path)
    get_route = _route(app, '/api/recipe-drafts/preferences', 'GET')
    put_route = _route(app, '/api/recipe-drafts/preferences', 'PUT')
    request = _auth_request(' User@Example.com ', 'moderator')
    payload = RecipeDraftPreferencesRequest(sortMode='drafts-desc', groupMode='author')

    assert put_route(request, payload) == {
        'ok': True,
        'sortMode': 'drafts-desc',
        'groupMode': 'author',
    }
    assert get_route(_auth_request('user@example.com')) == {
        'sortMode': 'drafts-desc',
        'groupMode': 'author',
    }

    storage_path = tmp_path / '.cubixrecipes_admin' / 'servers' / 'hitech' / 'recipe_draft_preferences.json'
    stored = json.loads(storage_path.read_text(encoding='utf-8'))
    assert stored['users'] == {'user@example.com': {'sortMode': 'drafts-desc', 'groupMode': 'author'}}


def test_recipe_draft_preferences_are_isolated_between_users(tmp_path: Path):
    app = _create_test_app(tmp_path)
    get_route = _route(app, '/api/recipe-drafts/preferences', 'GET')
    put_route = _route(app, '/api/recipe-drafts/preferences', 'PUT')

    put_route(_auth_request('alice@example.com', 'moderator'), RecipeDraftPreferencesRequest(sortMode='name', groupMode='mod'))
    put_route(_auth_request('bob@example.com', 'moderator'), RecipeDraftPreferencesRequest(sortMode='date-asc', groupMode='grid-size'))

    assert get_route(_auth_request('alice@example.com')) == {'sortMode': 'name', 'groupMode': 'mod'}
    assert get_route(_auth_request('bob@example.com')) == {'sortMode': 'date-asc', 'groupMode': 'grid-size'}
    assert get_route(_auth_request('carol@example.com')) == {'sortMode': 'date-desc', 'groupMode': 'none'}


def test_recipe_draft_preferences_validate_modes_at_schema_boundary():
    with pytest.raises(ValidationError):
        RecipeDraftPreferencesRequest(sortMode='invalid', groupMode='none')

    with pytest.raises(ValidationError):
        RecipeDraftPreferencesRequest(sortMode='date-desc', groupMode='invalid')


def test_recipe_draft_preferences_store_rejects_invalid_values(tmp_path: Path):
    store = RecipeDraftPreferencesStore(tmp_path / 'preferences.json')

    with pytest.raises(ValueError):
        store.save_for_user('user@example.com', {'sortMode': 'invalid', 'groupMode': 'none'})
