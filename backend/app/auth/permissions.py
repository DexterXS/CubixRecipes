from __future__ import annotations

import os
from typing import Literal

ROLE_ADMIN = 'admin'
ROLE_MODERATOR = 'moderator'
ROLE_DEFAULT = 'default'
ROOT_ADMIN_EMAIL = os.environ.get('ROOT_ADMIN_EMAIL', 'root.user76@gmail.com').strip().lower()

RoleName = Literal['admin', 'moderator', 'default']

ROLE_PERMISSIONS: dict[str, set[str]] = {
    ROLE_ADMIN: {
        'view',
        'files:add',
        'files:download',
        'files:manage',
        'mod-icons:manage',
        'recipes:edit',
        'templates:create',
        'templates:edit',
        'roles:manage',
        'settings:manage',
        'debug:manage',
    },
    ROLE_MODERATOR: {'view', 'templates:create'},
    ROLE_DEFAULT: {'view'},
}


def normalize_email(email: str | None) -> str:
    return (email or '').strip().lower()


def is_root_admin_email(email: str | None) -> bool:
    return normalize_email(email) == ROOT_ADMIN_EMAIL


def normalize_role(role: str | None, email: str | None = None) -> RoleName:
    if is_root_admin_email(email):
        return ROLE_ADMIN
    if role == ROLE_ADMIN:
        return ROLE_ADMIN
    if role == ROLE_MODERATOR:
        return ROLE_MODERATOR
    return ROLE_DEFAULT


def role_has_permission(role: str | None, permission: str, email: str | None = None) -> bool:
    normalized = normalize_role(role, email)
    return permission in ROLE_PERMISSIONS.get(normalized, set())


def permission_for_request(method: str, path: str) -> str:
    normalized_method = method.upper()
    if path.startswith('/api/admin/users'):
        return 'roles:manage'
    if path.startswith('/api/admin/mod-icons'):
        return 'mod-icons:manage'
    if path.startswith('/api/admin/zs-cloud'):
        return 'files:manage'
    if path.startswith('/api/recipe-drafts/templates'):
        return 'templates:create'
    if normalized_method == 'GET':
        return 'view'
    if path == '/api/recipes/create' and normalized_method == 'POST':
        return 'templates:create'
    if path.startswith('/api/recipes/') and normalized_method in {'PUT', 'PATCH', 'DELETE'}:
        return 'recipes:edit'
    if path in {'/api/recipes/save-as', '/api/zs/files/create'}:
        return 'files:add'
    if path.startswith('/api/settings/project') and normalized_method in {'PUT', 'PATCH', 'POST'}:
        return 'settings:manage'
    if path.startswith('/api/debug/') and normalized_method in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        return 'debug:manage'
    if path == '/api/index/scan' and normalized_method == 'POST':
        return 'debug:manage'
    return 'view'
