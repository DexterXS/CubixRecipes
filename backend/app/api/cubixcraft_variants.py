from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.auth.permissions import role_has_permission

router = APIRouter(prefix='/api/admin/cubixcraft-variants', tags=['cubixcraft'])


def _require_editor(request: Request) -> None:
    user = getattr(request.state, 'auth_user', {}) or {}
    if not role_has_permission(user.get('role'), 'recipes:edit', user.get('email')):
        raise HTTPException(status_code=403, detail='Recipe edit permission required')


def _store_path(request: Request) -> Path:
    context = getattr(request.state, 'server_context', None)
    if context is None:
        raise HTTPException(status_code=400, detail='Server context is not available')
    path = Path(context.admin_data_dir) / 'cubixcraft_variants.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _load(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    try:
        payload = json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return []
    return payload if isinstance(payload, list) else []


def _save(path: Path, variants: list[dict[str, Any]]) -> None:
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(variants, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(path)


def _variant_id(file_path: str, output: str, source: str) -> str:
    payload = f'{file_path}\0{output}\0{source}'.encode('utf-8')
    return hashlib.sha256(payload).hexdigest()[:24]


@router.get('')
def list_variants(request: Request, file_path: str = ''):
    _require_editor(request)
    variants = _load(_store_path(request))
    if file_path:
        variants = [item for item in variants if item.get('filePath') == file_path]
    return {'variants': variants}


@router.post('')
async def archive_variant(request: Request):
    _require_editor(request)
    payload = await request.json()
    file_path = str(payload.get('filePath') or '').strip()
    output = str(payload.get('output') or '').strip()
    source = str(payload.get('source') or '').strip()
    if not file_path or not output or not source:
        raise HTTPException(status_code=400, detail='filePath, output and source are required')

    source = source.replace('// CubixRecipes:preferred\n', '').replace('// CubixRecipes:preferred\r\n', '')
    path = _store_path(request)
    variants = _load(path)
    variant_id = _variant_id(file_path, output, source)
    now = datetime.now(timezone.utc).isoformat()
    existing = next((item for item in variants if item.get('id') == variant_id), None)
    if existing is None:
        existing = {
            'id': variant_id,
            'filePath': file_path,
            'output': output,
            'source': source,
            'createdAt': now,
            'updatedAt': now,
        }
        variants.append(existing)
    else:
        existing['updatedAt'] = now
        existing['source'] = source
    _save(path, variants)
    return {'ok': True, 'variant': existing}


@router.delete('/{variant_id}')
def delete_variant(variant_id: str, request: Request):
    _require_editor(request)
    path = _store_path(request)
    variants = _load(path)
    next_variants = [item for item in variants if item.get('id') != variant_id]
    if len(next_variants) == len(variants):
        raise HTTPException(status_code=404, detail='Archived CubixCraft variant not found')
    _save(path, next_variants)
    return {'ok': True}
