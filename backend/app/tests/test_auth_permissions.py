from app.auth.permissions import is_root_admin_email, normalize_role, permission_for_request, role_has_permission


def test_root_admin_email_is_always_admin():
    assert is_root_admin_email('root.user76@gmail.com')
    assert normalize_role('default', 'root.user76@gmail.com') == 'admin'
    assert role_has_permission('default', 'roles:manage', 'root.user76@gmail.com')


def test_role_permissions_match_expected_access():
    assert role_has_permission('admin', 'files:add')
    assert role_has_permission('moderator', 'templates:create')
    assert not role_has_permission('moderator', 'recipes:edit')
    assert role_has_permission('default', 'view')
    assert not role_has_permission('default', 'templates:create')


def test_permission_mapping_protects_mutating_routes():
    assert permission_for_request('POST', '/api/recipes/create') == 'templates:create'
    assert permission_for_request('PUT', '/api/recipes/abc') == 'recipes:edit'
    assert permission_for_request('POST', '/api/recipes/save-as') == 'files:add'
    assert permission_for_request('GET', '/api/recipes/abc') == 'view'
