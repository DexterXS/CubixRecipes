from __future__ import annotations

import json
import hashlib
import hmac
import os
import secrets
from pathlib import Path
from time import perf_counter
from typing import Any, Optional
from urllib.parse import quote, urlencode, urlparse
from urllib.parse import unquote
from zipfile import ZipFile

from fastapi import APIRouter, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse, RedirectResponse

from app.api.schemas import AccessControlRequest, BatchSearchRequest, CloudFileRequest, CreateFileRequest, CreateRecipeRequest, CustomItemRequest, DebugLogEventRequest, IndexScanRequest, IngredientSearchRequest, ParseRequest, ProjectSettingsRequest, RecipeDraftTemplateRequest, RenameCloudFileRequest, ResolveRequest, RoleUpdateRequest, SaveAsRequest, SearchRequest, UiPreferencesRequest, UpdateRecipeRequest, UploadCloudFileRequest
from app.auth.access_control import AccessControlStore
from app.auth.permissions import permission_for_request, role_has_permission
from app.auth.service import AuthService
from app.config.project_config import ProjectConfigService
from app.debug.debug_service import DebugService
from app.debug.log_service import DebugLogService
from app.domain.models import Recipe
from app.indexer.asset_index import AssetIndex
from app.indexer.itempanel_icon_catalog import ItemPanelIconCatalog
from app.items.custom_items import CustomItemService
from app.parsers.recipe_parser import RecipeParser
from app.resolver.item_resolver import ItemResolver
from app.services.item_case_alias_service import ItemCaseAliasService
from app.services.mod_icon_atlas_service import ArchiveAlreadyExistsError, InvalidModIconArchiveError, ModIconAtlasService
from app.services.recipe_service import RecipeService
from app.storage.zs_cloud import ZsCloudBackupService
from app.storage.recipe_drafts import RecipeDraftTemplateStore
from app.storage.zs_storage import ZsStorage


GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo'
OAUTH_STATE_COOKIE = 'cubix_oauth_state'


def serialize_recipe(recipe: Recipe) -> dict:
    return {
        'recipe_uid': recipe.recipe_uid,
        'recipe_type': recipe.recipe_type,
        'binding_mode': recipe.binding_mode.value,
        'name': recipe.name,
        'output': {
            'raw': recipe.output.raw,
            'modid': recipe.output.modid,
            'name': recipe.output.name,
            'metaKind': recipe.output.meta_mode.value,
            'metaValue': recipe.output.meta_value,
        },
        'output_resolution': recipe.output_resolution,
        'grid_w': recipe.grid_w,
        'grid_h': recipe.grid_h,
        'matrix': [
            [
                {
                    'raw': cell.raw,
                    'parsed': None if cell.item is None else {
                        'modid': cell.item.modid,
                        'name': cell.item.name,
                        'metaKind': cell.item.meta_mode.value,
                        'metaValue': cell.item.meta_value,
                    },
                    'resolution': cell.resolution,
                }
                for cell in row
            ]
            for row in recipe.matrix
        ],
        'source': {
            'kind': recipe.source.kind,
            'path': recipe.source.path,
            'start_offset': recipe.source.start_offset,
            'end_offset': recipe.source.end_offset,
        },
        'remove_template': recipe.remove_template,
        'diagnostics': {'parseWarnings': recipe.diagnostics, 'resolverHints': []},
    }


def _resolve_recipe_items(recipe: Recipe, resolver: ItemResolver, debug_service: DebugService) -> Recipe:
    output_resolution = resolver.resolve(recipe.output)
    debug_service.record_resolver(recipe.output.raw, recipe.output.base_key, output_resolution, resolver.last_resolution_details.get(recipe.output.raw))
    recipe.output_resolution = output_resolution.__dict__
    for row in recipe.matrix:
        for cell in row:
            if cell.item is None:
                cell.resolution = None
            else:
                resolved = resolver.resolve(cell.item)
                debug_service.record_resolver(cell.item.raw, cell.item.base_key, resolved, resolver.last_resolution_details.get(cell.item.raw))
                cell.resolution = resolved.__dict__
    return recipe


def _log_api(log_service: DebugLogService, method: str, path: str, payload: dict[str, Any], status: str, started_at: float, response_body: Any = None, level: str = 'INFO') -> None:
    duration_ms = round((perf_counter() - started_at) * 1000, 2)
    details = {'method': method, 'path': path, 'payload': payload, 'status': status, 'duration_ms': duration_ms}
    if response_body is not None:
        details['response'] = response_body
    log_service.log('API', level, 'API', f'{method} {path} -> {status}', details, verbose_only=(level == 'INFO'))


def _project_root_for_catalog(config_service: ProjectConfigService) -> Path:
    config_root = config_service.config_path.resolve(strict=False).parent
    if (config_root / 'itempanel.csv').is_file() or (config_root / 'itempanel_icons').is_dir():
        return config_root
    return Path(__file__).resolve().parents[3]


def _has_itempanel_icon_catalog(catalog: ItemPanelIconCatalog) -> bool:
    return bool(catalog.last_scan_report.get('matched', 0))


def _frontend_redirect_url() -> str:
    return os.environ.get('FRONTEND_PUBLIC_URL', '/').strip() or '/'


def _first_forwarded_value(value: str) -> str:
    return value.split(',', 1)[0].strip()


def _public_request_origin(request: Request) -> str:
    proto = _first_forwarded_value(request.headers.get('x-forwarded-proto', '')).lower()
    if proto not in {'http', 'https'}:
        proto = request.url.scheme
    host = _first_forwarded_value(
        request.headers.get('x-forwarded-host')
        or request.headers.get('host')
        or request.url.netloc
    )
    return f'{proto}://{host}'.rstrip('/')


def _google_redirect_uri(request: Request) -> str:
    explicit_redirect_uri = os.environ.get('GOOGLE_REDIRECT_URI', '').strip()
    if explicit_redirect_uri:
        return explicit_redirect_uri
    request_origin = _public_request_origin(request)
    app_public_url = os.environ.get('APP_PUBLIC_URL', '').strip().rstrip('/')
    if app_public_url and urlparse(app_public_url).netloc == urlparse(request_origin).netloc:
        return f'{app_public_url}/api/auth/google/callback'
    return f'{request_origin}/api/auth/google/callback'


def _session_secret() -> str:
    return os.environ.get('AUTH_SESSION_SECRET', '').strip()


def _get_request_session(request: Request) -> dict:
    try:
        return request.session
    except AssertionError:
        return {}


def _is_public_api_path(path: str) -> bool:
    return path in {
        '/api/auth/me',
        '/api/auth/google/start',
        '/api/auth/google/callback',
        '/api/auth/logout',
    }


def _google_client_config() -> tuple[str, str]:
    client_id = os.environ.get('GOOGLE_CLIENT_ID', '').strip()
    client_secret = os.environ.get('GOOGLE_CLIENT_SECRET', '').strip()
    if not client_id or not client_secret:
        raise HTTPException(status_code=503, detail='GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are required')
    return client_id, client_secret


def _sign_oauth_state(state: str) -> str:
    secret = _session_secret()
    signature = hmac.new(secret.encode('utf-8'), state.encode('utf-8'), hashlib.sha256).hexdigest()
    return f'{state}.{signature}'


def _verify_signed_oauth_state(signed_state: str | None) -> bool:
    if not signed_state or '.' not in signed_state:
        return False
    state, signature = signed_state.rsplit('.', 1)
    expected = _sign_oauth_state(state).rsplit('.', 1)[1]
    return hmac.compare_digest(signature, expected)


def _verify_oauth_state(cookie_state: str | None, returned_state: str | None) -> bool:
    if not _verify_signed_oauth_state(returned_state):
        return False
    if cookie_state:
        return hmac.compare_digest(cookie_state, returned_state)
    return True


def _cors_origins() -> list[str]:
    raw_values = [
        os.environ.get('FRONTEND_PUBLIC_URL', ''),
        os.environ.get('CORS_ALLOWED_ORIGINS', ''),
    ]
    origins: list[str] = []
    for raw_value in raw_values:
        for value in raw_value.split(','):
            origin = value.strip().rstrip('/')
            if origin and origin not in origins:
                origins.append(origin)
    return origins


def _cookie_same_site() -> str:
    configured = os.environ.get('AUTH_COOKIE_SAMESITE', '').strip().lower()
    if configured in {'lax', 'strict', 'none'}:
        return configured
    frontend_url = os.environ.get('FRONTEND_PUBLIC_URL', '').strip()
    app_url = os.environ.get('APP_PUBLIC_URL', '').strip()
    if frontend_url and app_url and urlparse(frontend_url).netloc != urlparse(app_url).netloc:
        return 'none'
    return 'lax'


def _cookie_https_only(same_site: str) -> bool:
    app_public_url = os.environ.get('APP_PUBLIC_URL', '').strip().lower()
    cookie_secure = os.environ.get('AUTH_COOKIE_SECURE', '').strip().lower()
    return (
        same_site == 'none'
        or cookie_secure in {'1', 'true', 'yes', 'on'}
        or (not cookie_secure and app_public_url.startswith('https://'))
    )


def create_app(scripts_dir: str = 'scripts', config_path: Optional[str] = None) -> FastAPI:
    parser = RecipeParser()
    config_service = ProjectConfigService(Path(config_path) if config_path else None)
    config = config_service.load()
    raw_config_payload = {}
    config_path_obj = Path(config.project_config_path)
    if config_path_obj.exists():
        try:
            raw_config_payload = json.loads(config_path_obj.read_text(encoding='utf-8'))
        except Exception:
            raw_config_payload = {'_raw': config_path_obj.read_text(encoding='utf-8', errors='replace')[:2000]}
    log_service = DebugLogService(verbose=config.verbose_debug_logging)
    debug_service = DebugService(config_service)
    active_scripts_dir = scripts_dir if scripts_dir != 'scripts' else config.scripts_dir
    storage = ZsStorage(active_scripts_dir, log_service=log_service)
    storage.scan(extra_paths=config_service.build_extra_recipe_scan_paths(config))
    asset_index = AssetIndex(log_service=log_service)
    project_root = _project_root_for_catalog(config_service)
    itempanel_icon_catalog = ItemPanelIconCatalog(project_root / 'itempanel.csv', project_root / 'itempanel_icons')
    itempanel_icon_catalog.scan()
    admin_data_dir = config_service.config_path.resolve(strict=False).parent / '.cubixrecipes_admin'
    storage.excluded_managed_roots = [admin_data_dir]
    access_control_store = AccessControlStore(admin_data_dir / 'access_control.json')
    mod_icon_atlas_service = ModIconAtlasService(admin_data_dir / 'mod_icon_archives', admin_data_dir / 'mod_icon_atlases')
    item_case_alias_service = ItemCaseAliasService(Path(active_scripts_dir), itempanel_icon_catalog.csv_path, admin_data_dir / 'item_case_aliases')
    zs_backup_service = ZsCloudBackupService(admin_data_dir / 'secret_zs_backups')
    recipe_draft_store = RecipeDraftTemplateStore(admin_data_dir / 'recipe_draft_templates.json')
    resolver = ItemResolver(asset_index, log_service=log_service, itempanel_icon_catalog=itempanel_icon_catalog)
    index_paths = config_service.build_index_paths(config)
    if index_paths and not _has_itempanel_icon_catalog(itempanel_icon_catalog):
        asset_index.scan_paths(index_paths)
    debug_service.update_config(config, used_recipe_paths=config_service.build_recipe_scan_paths(config), used_asset_paths=index_paths)
    debug_service.record_recipe_scan(storage.last_scan_report)
    debug_service.record_asset_scan(asset_index.last_scan_report)
    service = RecipeService(storage, parser)
    auth_service = AuthService(root_admin_email=os.environ.get('ROOT_ADMIN_EMAIL', 'root.user76@gmail.com'))
    custom_item_service = CustomItemService(auth_service.require_session_factory)

    log_service.log('BACKEND', 'INFO', 'CONFIG', 'Application bootstrapped', {
        'config_file': config.project_config_path,
        'raw_config_payload': raw_config_payload,
        'normalized_config': config_service.as_api_dict(config),
        'final_index_paths': index_paths,
        'final_recipe_scan_paths': config_service.build_recipe_scan_paths(config),
        'scripts_dir': active_scripts_dir,
        'verbose_debug_logging': config.verbose_debug_logging,
        'itempanel_icon_catalog': itempanel_icon_catalog.last_scan_report,
    })

    router = APIRouter(prefix='/api')

    def _attachment_headers(filename: str) -> dict[str, str]:
        return {'Content-Disposition': f"attachment; filename*=UTF-8''{quote(filename)}"}

    def _require_root_admin(request: Request) -> None:
        user = getattr(request.state, 'auth_user', {}) or {}
        if not user.get('is_root_admin'):
            raise HTTPException(status_code=403, detail='Root admin access required')

    @router.get('/auth/me')
    def auth_me(request: Request):
        session = _get_request_session(request)
        user_id = session.get('user_id')
        if not auth_service.is_configured or not user_id:
            return {'authenticated': False, 'user': None, 'access_allowed': False, **access_control_store.as_dict(), **auth_service.public_config()}
        try:
            user = auth_service.get_user(int(user_id))
        except Exception:
            session.clear()
            return {'authenticated': False, 'user': None, 'access_allowed': False, **access_control_store.as_dict(), **auth_service.public_config()}
        if user is None:
            session.clear()
            return {'authenticated': False, 'user': None, 'access_allowed': False, **access_control_store.as_dict(), **auth_service.public_config()}
        user_payload = user.as_dict()
        return {'authenticated': True, 'user': user_payload, 'access_allowed': access_control_store.is_allowed(user_payload), **access_control_store.as_dict(), **auth_service.public_config()}

    @router.get('/auth/google/start')
    def google_auth_start(request: Request):
        if not auth_service.is_configured:
            raise HTTPException(status_code=503, detail=auth_service.configuration_error or 'Authentication is not configured')
        client_id, _client_secret = _google_client_config()
        state = _sign_oauth_state(secrets.token_urlsafe(32))
        auth_params = {
            "client_id": client_id,
            "redirect_uri": _google_redirect_uri(request),
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
        auth_url = f'{GOOGLE_AUTH_URL}?{urlencode(auth_params)}'
        response = RedirectResponse(auth_url)
        same_site = _cookie_same_site()
        response.set_cookie(
            OAUTH_STATE_COOKIE,
            state,
            max_age=600,
            httponly=True,
            secure=_cookie_https_only(same_site),
            samesite=same_site,
        )
        return response

    @router.get('/auth/google/callback', name='google_auth_callback')
    async def google_auth_callback(request: Request):
        if not auth_service.is_configured:
            raise HTTPException(status_code=503, detail=auth_service.configuration_error or 'Authentication is not configured')
        error = request.query_params.get('error')
        if error:
            raise HTTPException(status_code=400, detail=f'Google OAuth failed: {error}')
        code = request.query_params.get('code')
        state = request.query_params.get('state')
        if not code:
            raise HTTPException(status_code=400, detail='Google OAuth callback did not include code')
        if not _verify_oauth_state(request.cookies.get(OAUTH_STATE_COOKIE), state):
            raise HTTPException(status_code=400, detail='Google OAuth state mismatch. Start login again.')
        client_id, client_secret = _google_client_config()
        try:
            import httpx
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f'Google OAuth HTTP client is not installed: {exc.__class__.__name__}: {exc}') from exc
        async with httpx.AsyncClient(timeout=15) as client:
            token_response = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    'code': code,
                    'client_id': client_id,
                    'client_secret': client_secret,
                    'redirect_uri': _google_redirect_uri(request),
                    'grant_type': 'authorization_code',
                },
            )
            if token_response.status_code >= 400:
                raise HTTPException(status_code=400, detail=f'Google token exchange failed: {token_response.text[:300]}')
            token = token_response.json()
            userinfo_response = await client.get(
                GOOGLE_USERINFO_URL,
                headers={'Authorization': f"Bearer {token.get('access_token', '')}"},
            )
            if userinfo_response.status_code >= 400:
                raise HTTPException(status_code=400, detail=f'Google userinfo failed: {userinfo_response.text[:300]}')
            profile = dict(userinfo_response.json())
        if profile.get('email_verified') is False:
            raise HTTPException(status_code=403, detail='Google account email is not verified')
        user = auth_service.upsert_google_user(profile)
        session = _get_request_session(request)
        session.clear()
        session['user_id'] = user.id
        session['user_email'] = user.email
        response = RedirectResponse(_frontend_redirect_url())
        response.delete_cookie(OAUTH_STATE_COOKIE)
        return response

    @router.post('/auth/logout')
    def auth_logout(request: Request):
        _get_request_session(request).clear()
        return {'ok': True}

    @router.get('/admin/users')
    def admin_list_users():
        return {'users': [user.as_dict() for user in auth_service.list_users()]}

    @router.patch('/admin/users/{user_id}/role')
    def admin_update_user_role(user_id: int, request: RoleUpdateRequest):
        try:
            user = auth_service.set_user_role(user_id, request.role)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail='User not found') from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return {'ok': True, 'user': user.as_dict()}

    @router.get('/admin/access')
    def admin_access_control():
        return access_control_store.as_dict()

    @router.put('/admin/access')
    def admin_update_access_control(request: AccessControlRequest):
        updated = access_control_store.save(request.model_dump())
        log_service.log('BACKEND', 'INFO', 'AUTH', 'Access control updated', access_control_store.as_dict(updated))
        return {'ok': True, **access_control_store.as_dict(updated)}

    @router.get('/admin/mod-icons')
    def admin_mod_icons_status():
        return mod_icon_atlas_service.status()

    @router.post('/admin/itempanel/csv')
    async def admin_upload_itempanel_csv(request: Request, filename: str = ''):
        upload_name = filename or request.headers.get('x-itempanel-filename', '')
        if upload_name and not upload_name.lower().endswith('.csv'):
            raise HTTPException(status_code=400, detail='Only .csv itempanel files are supported')
        content = await request.body()
        if not content.strip():
            raise HTTPException(status_code=400, detail='CSV file is empty')
        target = itempanel_icon_catalog.csv_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
        itempanel_icon_catalog.scan()
        log_service.log('BACKEND', 'INFO', 'ASSETS', 'Itempanel CSV uploaded', {'path': str(target), 'scan': itempanel_icon_catalog.last_scan_report})
        return {'ok': True, 'path': str(target), 'scan': itempanel_icon_catalog.last_scan_report, 'atlas': itempanel_icon_catalog.get_atlas_manifest()}

    @router.post('/admin/mod-icons/archive')
    async def admin_upload_mod_icons_archive(request: Request, filename: str = '', replace: bool = False):
        archive_name = filename or request.headers.get('x-archive-filename', '')
        content = await request.body()
        try:
            uploaded = mod_icon_atlas_service.upload_archive(archive_name, content, replace=replace)
        except ArchiveAlreadyExistsError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except InvalidModIconArchiveError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        log_service.log('BACKEND', 'INFO', 'ASSETS', 'Mod icon archive uploaded', uploaded)
        return {'ok': True, 'archive': uploaded, 'status': mod_icon_atlas_service.status()}

    @router.post('/admin/mod-icons/generate')
    def admin_generate_mod_icon_atlases():
        manifest = mod_icon_atlas_service.generate_atlases()
        log_service.log('BACKEND', 'INFO', 'ASSETS', 'Mod icon atlases generated', {'atlases': len(manifest.get('atlases', [])), 'totalMods': manifest.get('totalMods')})
        return {'ok': True, 'manifest': manifest}

    @router.get('/admin/item-case-aliases')
    def admin_item_case_alias_report():
        report = item_case_alias_service.load_report()
        return {'ok': True, 'report': report}

    @router.post('/admin/item-case-aliases/generate')
    def admin_generate_item_case_alias_report():
        report = item_case_alias_service.build()
        log_service.log('BACKEND', 'INFO', 'ASSETS', 'Item case alias report generated', report.get('summary', {}))
        return {'ok': True, 'report': report}

    @router.get('/admin/mod-icons/atlases/{filename}')
    def admin_mod_icon_atlas_png(filename: str):
        content = mod_icon_atlas_service.read_atlas_png(filename)
        if content is None:
            raise HTTPException(status_code=404, detail='Mod icon atlas is not available')
        return Response(content=content, media_type='image/png')

    @router.get('/mod-icons/atlas')
    def mod_icon_atlas_manifest():
        return {'manifest': mod_icon_atlas_service.read_manifest()}

    @router.get('/mod-icons/atlases/{filename}')
    def mod_icon_atlas_png(filename: str):
        content = mod_icon_atlas_service.read_atlas_png(filename)
        if content is None:
            raise HTTPException(status_code=404, detail='Mod icon atlas is not available')
        return Response(content=content, media_type='image/png')

    @router.get('/admin/zs-cloud/files')
    def admin_list_zs_cloud_files():
        return {'files': storage.list_managed_zs_files()}

    @router.get('/admin/zs-cloud/files/download')
    def admin_download_zs_cloud_file(path: str):
        try:
            file_path, text = storage.read_zs_file(path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return Response(content=text.encode('utf-8'), media_type='text/plain; charset=utf-8', headers=_attachment_headers(file_path.name))

    @router.post('/admin/zs-cloud/files/upload')
    def admin_upload_zs_cloud_file(request: UploadCloudFileRequest):
        try:
            target = storage.resolve_cloud_file_target(request.filename)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if target.exists() and request.mode == 'fail':
            raise HTTPException(status_code=409, detail=f'File already exists: {target.name}')
        if target.exists():
            zs_backup_service.backup_file(target)
        try:
            saved = storage.upload_cloud_file(request.filename, request.text, request.mode)
        except FileExistsError as exc:
            raise HTTPException(status_code=409, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        zs_backup_service.backup_file(saved)
        debug_service.record_recipe_scan(storage.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Admin uploaded .zs file to cloud', {'path': str(saved), 'mode': request.mode})
        return {'ok': True, 'path': str(saved), 'files': storage.list_managed_zs_files()}

    @router.delete('/admin/zs-cloud/files')
    def admin_delete_zs_cloud_file(request: CloudFileRequest):
        try:
            file_path = storage.resolve_existing_zs_file(request.path)
            zs_backup_service.backup_file(file_path)
            deleted = storage.delete_zs_file(request.path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        debug_service.record_recipe_scan(storage.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Admin deleted .zs file', {'path': str(deleted)})
        return {'ok': True, 'path': str(deleted), 'files': storage.list_managed_zs_files()}

    @router.patch('/admin/zs-cloud/files/rename')
    def admin_rename_zs_cloud_file(request: RenameCloudFileRequest):
        try:
            old_path = storage.resolve_existing_zs_file(request.path)
            zs_backup_service.backup_file(old_path)
            new_path = storage.rename_zs_file(request.path, request.new_name)
            zs_backup_service.backup_file(new_path)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        debug_service.record_recipe_scan(storage.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Admin renamed .zs file', {'old_path': request.path, 'new_path': str(new_path)})
        return {'ok': True, 'path': str(new_path), 'files': storage.list_managed_zs_files()}

    @router.get('/admin/zs-cloud/backups')
    def admin_list_zs_cloud_backups(request: Request):
        _require_root_admin(request)
        managed_paths = [Path(str(item['path'])) for item in storage.list_managed_zs_files()]
        zs_backup_service.backup_many(managed_paths)
        return {'backups': zs_backup_service.list_backups()}

    @router.get('/admin/zs-cloud/backups/{backup_id}/download')
    def admin_download_zs_cloud_backup(backup_id: str, request: Request):
        _require_root_admin(request)
        backup = zs_backup_service.read_backup(backup_id)
        if backup is None:
            raise HTTPException(status_code=404, detail='Backup file not found')
        filename, content = backup
        return Response(content=content, media_type='text/plain; charset=utf-8', headers=_attachment_headers(filename))

    @router.post('/parse')
    def parse_route(request: ParseRequest):
        started_at = perf_counter()
        log_service.log('API', 'INFO', 'API', 'POST /api/parse received', {'payload': {'text_length': len(request.text), 'preview': request.text[:200]}})
        try:
            parsed = service.parse_text(request.text)
        except Exception as exc:
            debug_service.record_parse(debug_service.build_parse_error(request.text, exc))
            log_service.log('BACKEND', 'ERROR', 'PARSE', 'Parse failed', {'error': str(exc), 'error_type': exc.__class__.__name__, 'raw_input': request.text[:500]})
            _log_api(log_service, 'POST', '/api/parse', {'text_length': len(request.text)}, '400', started_at, {'detail': str(exc)}, level='ERROR')
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        if parsed.kind == 'item_query':
            _log_api(log_service, 'POST', '/api/parse', {'text_length': len(request.text)}, '200', started_at, {'kind': parsed.kind})
            return {'kind': parsed.kind, 'item': parsed.item.__dict__}
        recipe = _resolve_recipe_items(parsed.recipe, resolver, debug_service)
        debug_service.record_parse(debug_service.build_parse_diagnostic_for_recipe(request.text, recipe))
        log_service.log('RESOLVER', 'INFO', 'ICON', 'Icon lookup completed for parsed recipe', {
            'recipe_uid': recipe.recipe_uid,
            'output_raw': recipe.output.raw,
            'output_icon_url': recipe.output_resolution.get('icon_url') if recipe.output_resolution else None,
            'resolved_cells': sum(1 for row in recipe.matrix for cell in row if cell.resolution and cell.resolution.get('icon_url')),
        })
        log_service.log('BACKEND', 'INFO', 'PARSE', 'Recipe parsed', {
            'recipe_type': recipe.recipe_type,
            'output': recipe.output.raw,
            'grid': f'{recipe.grid_w}x{recipe.grid_h}',
            'parsed_cells': sum(1 for row in recipe.matrix for cell in row if cell.item is not None),
            'null_cells': sum(1 for row in recipe.matrix for cell in row if cell.raw is None),
            'warnings': list(recipe.diagnostics),
            'raw_input': request.text[:500],
        })
        response_body = {'kind': parsed.kind, 'recipe_uid': recipe.recipe_uid, 'output': recipe.output.raw}
        _log_api(log_service, 'POST', '/api/parse', {'text_length': len(request.text)}, '200', started_at, response_body)
        return {'kind': parsed.kind, 'recipe': serialize_recipe(recipe)}

    @router.post('/recipes/search')
    def search_route(request: SearchRequest):
        started_at = perf_counter()
        matches = [serialize_recipe(_resolve_recipe_items(recipe, resolver, debug_service)) for recipe in storage.search_by_output(request.output_item_raw)]
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe search completed', {'output_item_raw': request.output_item_raw, 'matches': len(matches)})
        _log_api(log_service, 'POST', '/api/recipes/search', {'output_item_raw': request.output_item_raw}, '200', started_at, {'matches': len(matches)})
        return {'matches': matches}

    @router.post('/recipes/uses')
    def recipe_uses_route(request: IngredientSearchRequest):
        started_at = perf_counter()
        matches = [serialize_recipe(_resolve_recipe_items(recipe, resolver, debug_service)) for recipe in storage.search_by_ingredient(request.item_raw)]
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe uses search completed', {'item_raw': request.item_raw, 'matches': len(matches)})
        _log_api(log_service, 'POST', '/api/recipes/uses', {'item_raw': request.item_raw}, '200', started_at, {'matches': len(matches)})
        return {'matches': matches}

    @router.post('/recipes/search-batch')
    def search_batch_route(request: BatchSearchRequest):
        started_at = perf_counter()
        unique_raws = list(dict.fromkeys(raw.strip() for raw in request.output_item_raws if raw.strip()))
        matches = {raw: len(storage.search_by_output(raw)) for raw in unique_raws}
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe batch search completed', {'items': len(unique_raws), 'matched': sum(1 for count in matches.values() if count > 0)})
        _log_api(log_service, 'POST', '/api/recipes/search-batch', {'items': len(unique_raws)}, '200', started_at, {'matched': sum(1 for count in matches.values() if count > 0)})
        return {'matches': matches}

    @router.get('/recipes/{recipe_uid}')
    def get_recipe(recipe_uid: str):
        started_at = perf_counter()
        try:
            recipe = serialize_recipe(_resolve_recipe_items(storage.get_recipe(recipe_uid), resolver, debug_service))
            _log_api(log_service, 'GET', f'/api/recipes/{recipe_uid}', {}, '200', started_at, {'recipe_uid': recipe_uid})
            return recipe
        except KeyError as exc:
            _log_api(log_service, 'GET', f'/api/recipes/{recipe_uid}', {}, '404', started_at, {'detail': 'Recipe not found'}, level='ERROR')
            raise HTTPException(status_code=404, detail='Recipe not found') from exc

    @router.put('/recipes/{recipe_uid}')
    def update_recipe(recipe_uid: str, request: UpdateRecipeRequest):
        started_at = perf_counter()
        try:
            existing = storage.get_recipe(recipe_uid)
        except KeyError as exc:
            _log_api(log_service, 'PUT', f'/api/recipes/{recipe_uid}', {'output_raw': request.output_raw}, '404', started_at, {'detail': 'Recipe not found'}, level='ERROR')
            raise HTTPException(status_code=404, detail='Recipe not found') from exc
        remove_template = getattr(request, 'remove_template', None)
        recipe = service.update_recipe(existing, request.output_raw, request.matrix, request.name, request.binding_mode, request.recipe_type, remove_template)
        try:
            rendered = service.render_recipe(recipe, remove_template)
        except ValueError as exc:
            _log_api(log_service, 'PUT', f'/api/recipes/{recipe_uid}', {'output_raw': request.output_raw}, '400', started_at, {'detail': str(exc)}, level='ERROR')
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        try:
            updated = storage.save_existing(recipe_uid, rendered)
        except KeyError as exc:
            _log_api(log_service, 'PUT', f'/api/recipes/{recipe_uid}', {'output_raw': request.output_raw}, '404', started_at, {'detail': 'Recipe not found'}, level='ERROR')
            raise HTTPException(status_code=404, detail='Recipe not found') from exc
        if updated.source.path:
            zs_backup_service.backup_file(Path(updated.source.path))
        debug_service.record_recipe_scan(storage.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe updated', {'recipe_uid': recipe_uid, 'output_raw': request.output_raw, 'matrix_rows': len(request.matrix)})
        response_body = {'ok': True, 'updatedRecipe': serialize_recipe(_resolve_recipe_items(updated, resolver, debug_service))}
        _log_api(log_service, 'PUT', f'/api/recipes/{recipe_uid}', {'output_raw': request.output_raw}, '200', started_at, {'recipe_uid': recipe_uid})
        return response_body

    @router.post('/recipes/create')
    def create_recipe(request: CreateRecipeRequest):
        started_at = perf_counter()
        recipe = service.create_recipe(request.templateType, request.output, request.grid, request.bindingMode)
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe template created', {'template_type': request.templateType, 'output': request.output, 'grid': request.grid})
        _log_api(log_service, 'POST', '/api/recipes/create', {'templateType': request.templateType, 'grid': request.grid}, '200', started_at, {'recipe_uid': recipe.recipe_uid})
        return serialize_recipe(_resolve_recipe_items(recipe, resolver, debug_service))

    @router.get('/zs/files')
    def list_zs_files():
        started_at = perf_counter()
        files = storage.list_files()
        _log_api(log_service, 'GET', '/api/zs/files', {}, '200', started_at, {'files': len(files)})
        return {'files': files}

    @router.post('/zs/files/create')
    def create_zs_file(request: CreateFileRequest):
        started_at = perf_counter()
        try:
            path = storage.create_file(request.path)
        except ValueError as exc:
            _log_api(log_service, 'POST', '/api/zs/files/create', {'path': request.path}, '400', started_at, {'detail': str(exc)}, level='ERROR')
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        zs_backup_service.backup_file(Path(path))
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Created .zs file', {'path': path})
        _log_api(log_service, 'POST', '/api/zs/files/create', {'path': request.path}, '200', started_at, {'path': path})
        return {'ok': True, 'path': path}

    @router.post('/recipes/save-as')
    def save_as(request: SaveAsRequest):
        started_at = perf_counter()
        try:
            recipe = storage.get_recipe(request.recipe_uid)
            remove_template = getattr(request, 'remove_template', None)
            recipe = service.update_recipe(recipe, request.output_raw, request.matrix, request.name, request.binding_mode, request.recipe_type, remove_template)
        except KeyError:
            recipe = service.create_recipe(request.recipe_type, request.output_raw, len(request.matrix), request.binding_mode)
            recipe.recipe_uid = request.recipe_uid
            remove_template = getattr(request, 'remove_template', None)
            recipe = service.update_recipe(recipe, request.output_raw, request.matrix, request.name, request.binding_mode, request.recipe_type, remove_template)
        try:
            new_uid = storage.save_as(service.render_recipe(recipe, remove_template), request.target_path)
        except ValueError as exc:
            _log_api(log_service, 'POST', '/api/recipes/save-as', {'target_path': request.target_path}, '400', started_at, {'detail': str(exc)}, level='ERROR')
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        saved_recipe = storage.get_recipe(new_uid)
        if saved_recipe.source.path:
            zs_backup_service.backup_file(Path(saved_recipe.source.path))
        debug_service.record_recipe_scan(storage.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe saved as', {'recipe_uid': request.recipe_uid, 'new_uid': new_uid, 'target_path': request.target_path})
        response = {'ok': True, 'new_uid': new_uid, 'recipe': serialize_recipe(_resolve_recipe_items(saved_recipe, resolver, debug_service))}
        _log_api(log_service, 'POST', '/api/recipes/save-as', {'target_path': request.target_path}, '200', started_at, {'new_uid': new_uid})
        return response

    @router.post('/index/scan')
    def index_scan(request: IndexScanRequest):
        started_at = perf_counter()
        paths = request.paths or config_service.build_index_paths(config_service.load())
        asset_index.reset()
        scan_id = asset_index.scan_paths(paths)
        debug_service.record_asset_scan(asset_index.last_scan_report)
        _log_api(log_service, 'POST', '/api/index/scan', {'paths': paths}, '200', started_at, {'scan_id': scan_id})
        return {'scan_id': scan_id, 'paths': paths}

    @router.get('/index/status/{scan_id}')
    def index_status(scan_id: str):
        started_at = perf_counter()
        status = asset_index.scan_status.get(scan_id)
        if status is None:
            _log_api(log_service, 'GET', f'/api/index/status/{scan_id}', {}, '404', started_at, {'detail': 'Unknown scan id'}, level='ERROR')
            raise HTTPException(status_code=404, detail='Unknown scan id')
        _log_api(log_service, 'GET', f'/api/index/status/{scan_id}', {}, '200', started_at, {'progress': status.get('progress')})
        return status

    @router.post('/items/resolve')
    def resolve_item(request: ResolveRequest):
        started_at = perf_counter()
        item = parser.parse_item_ref(request.item_raw)
        result = resolver.resolve(item, request.settings)
        debug_service.record_resolver(item.raw, item.base_key, result, resolver.last_resolution_details.get(item.raw))
        log_service.log('RESOLVER', 'INFO', 'ICON', 'Icon lookup requested', {'raw_item_id': item.raw, 'icon_asset_id': result.icon_asset_id, 'strategy': result.strategy})
        if result.icon_asset_id is None:
            log_service.log('BACKEND', 'WARN', 'ICON', 'Resolver returned no icon', {'raw_item_id': item.raw, 'checked': resolver.last_resolution_details.get(item.raw)})
        _log_api(log_service, 'POST', '/api/items/resolve', {'item_raw': request.item_raw}, '200', started_at, {'strategy': result.strategy, 'icon_asset_id': result.icon_asset_id})
        return result.__dict__

    @router.get('/items/custom')
    def list_custom_items(request: Request):
        user = request.state.auth_user
        return {'items': custom_item_service.list_for_user(user['email'])}

    @router.post('/items/custom')
    def save_custom_item(request: Request, payload: CustomItemRequest):
        user = request.state.auth_user
        is_global = payload.scope == 'global'
        if is_global and not role_has_permission(user.get('role'), 'settings:manage', user.get('email')):
            raise HTTPException(status_code=403, detail='Only admins can save global custom items')
        try:
            saved = custom_item_service.save_for_user(payload.model_dump(), user['email'], is_global)
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return {'ok': True, 'item': saved}

    @router.delete('/items/custom/{item_id}')
    def delete_custom_item(item_id: int, request: Request):
        user = request.state.auth_user
        can_delete_global = role_has_permission(user.get('role'), 'settings:manage', user.get('email'))
        try:
            custom_item_service.delete_for_user(item_id, user['email'], can_delete_global)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail='Custom item not found') from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return {'ok': True}

    @router.get('/recipe-drafts/templates')
    def list_recipe_draft_templates(request: Request):
        user = request.state.auth_user
        can_view_all = role_has_permission(user.get('role'), 'templates:edit', user.get('email'))
        return {'templates': recipe_draft_store.list_for_user(user['email'], can_view_all)}

    @router.post('/recipe-drafts/templates')
    def create_recipe_draft_template(request: Request, payload: RecipeDraftTemplateRequest):
        user = request.state.auth_user
        template = recipe_draft_store.create_for_user(payload.model_dump(), user['email'])
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Recipe draft template saved', {'draft_id': template['id'], 'output_raw': template['outputRaw'], 'created_by': user['email']})
        return {'ok': True, 'template': template}

    @router.delete('/recipe-drafts/templates/{draft_id}')
    def delete_recipe_draft_template(draft_id: str, request: Request):
        user = request.state.auth_user
        can_delete_all = role_has_permission(user.get('role'), 'templates:edit', user.get('email'))
        try:
            recipe_draft_store.delete_for_user(draft_id, user['email'], can_delete_all)
        except KeyError as exc:
            raise HTTPException(status_code=404, detail='Draft template not found') from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return {'ok': True}

    @router.get('/itempanel/atlas')
    def itempanel_atlas_manifest():
        return itempanel_icon_catalog.get_atlas_manifest()

    @router.get('/itempanel/atlas.png')
    def itempanel_atlas_png():
        content = itempanel_icon_catalog.read_atlas_png()
        if content is None:
            raise HTTPException(status_code=404, detail='Itempanel atlas is not available')
        return Response(content=content, media_type='image/png')

    @router.get('/settings/project')
    def get_project_settings():
        current = config_service.load()
        debug_service.update_config(current, used_recipe_paths=config_service.build_recipe_scan_paths(current), used_asset_paths=config_service.build_index_paths(current))
        return config_service.as_api_dict(current)

    @router.put('/settings/project')
    def update_project_settings(request: ProjectSettingsRequest):
        started_at = perf_counter()
        updated = config_service.update(request.model_dump())
        log_service.set_verbose(updated.verbose_debug_logging)
        storage.scripts_dir = Path(updated.scripts_dir)
        storage.scan(extra_paths=config_service.build_extra_recipe_scan_paths(updated))
        asset_index.reset()
        index_paths = config_service.build_index_paths(updated)
        if index_paths and not _has_itempanel_icon_catalog(itempanel_icon_catalog):
            asset_index.scan_paths(index_paths)
        debug_service.update_config(updated, used_recipe_paths=config_service.build_recipe_scan_paths(updated), used_asset_paths=index_paths)
        debug_service.record_recipe_scan(storage.last_scan_report)
        debug_service.record_asset_scan(asset_index.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'CONFIG', 'Project settings updated', {'scripts_dir': updated.scripts_dir, 'mods_dir': updated.mods_dir, 'assets_dir': updated.assets_dir, 'verbose_debug_logging': updated.verbose_debug_logging})
        response = config_service.as_api_dict(updated)
        _log_api(log_service, 'PUT', '/api/settings/project', request.model_dump(), '200', started_at, {'verbose_debug_logging': updated.verbose_debug_logging})
        return response

    @router.put('/settings/project/ui')
    def update_project_ui_preferences(request: UiPreferencesRequest):
        started_at = perf_counter()
        updated = config_service.update_ui_preferences(request.model_dump())
        debug_service.update_config(updated, used_recipe_paths=config_service.build_recipe_scan_paths(updated), used_asset_paths=config_service.build_index_paths(updated))
        response = config_service.as_api_dict(updated)
        _log_api(log_service, 'PUT', '/api/settings/project/ui', {'ui_preferences': request.model_dump()}, '200', started_at, {'language': updated.ui_preferences.language, 'layout_items': len(updated.ui_preferences.panel_layout)})
        return response

    @router.post('/debug/recipes/rescan')
    def rescan_recipes():
        current = config_service.load()
        storage.scripts_dir = Path(current.scripts_dir)
        storage.scan(extra_paths=current.extra_recipe_sources)
        debug_service.update_config(current, used_recipe_paths=config_service.build_recipe_scan_paths(current), used_asset_paths=config_service.build_index_paths(current))
        debug_service.record_recipe_scan(storage.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'RECIPES', 'Manual recipe rescan triggered', {'paths': storage.last_scan_report.get('active_paths', [])})
        return storage.last_scan_report

    @router.post('/debug/assets/rescan')
    def rescan_assets():
        current = config_service.load()
        paths = config_service.build_index_paths(current)
        asset_index.reset()
        if paths:
            asset_index.scan_paths(paths)
        debug_service.update_config(current, used_recipe_paths=config_service.build_recipe_scan_paths(current), used_asset_paths=paths)
        debug_service.record_asset_scan(asset_index.last_scan_report)
        log_service.log('BACKEND', 'INFO', 'ASSETS', 'Manual asset rescan triggered', {'paths': paths})
        return asset_index.last_scan_report

    @router.get('/debug/config')
    def debug_config():
        current = config_service.load()
        debug_service.update_config(current, used_recipe_paths=config_service.build_recipe_scan_paths(current), used_asset_paths=config_service.build_index_paths(current))
        return debug_service.snapshot()['config']

    @router.get('/debug/recipes')
    def debug_recipes():
        return debug_service.snapshot()['recipe_scan']

    @router.get('/debug/assets')
    def debug_assets():
        return debug_service.snapshot()['asset_scan']

    @router.get('/debug/resolver')
    def debug_resolver():
        return debug_service.snapshot()['resolver']

    @router.get('/debug/parse')
    def debug_parse():
        return debug_service.snapshot()['parse']

    @router.post('/debug/clear')
    def debug_clear():
        debug_service.clear()
        return {'ok': True}

    @router.post('/debug/log')
    def ingest_debug_log(request: DebugLogEventRequest):
        event = log_service.ingest(request.model_dump())
        return {'ok': True, 'event': event}

    @router.get('/debug/log')
    def debug_log(source: str = 'All', level: str = 'All', since_id: int = 0, limit: int = 100, include_details: bool = False, include_text: bool = False):
        safe_since_id = max(0, since_id)
        safe_limit = min(max(0, limit), 1000)
        query = log_service.query_events(source=source, level=level, since_id=safe_since_id, limit=safe_limit, include_details=include_details)
        events = query['events']
        response = {
            'events': events,
            'verbose': log_service.verbose,
            'nextSinceId': query['next_since_id'],
            'hasMore': query['has_more'],
            'diagnostics': query['diagnostics'],
        }
        if include_text:
            response['exportText'] = log_service.export_text(events)
        return response

    @router.post('/debug/log/clear')
    def debug_log_clear():
        log_service.clear()
        return {'ok': True}

    @router.get('/debug/log/export')
    def debug_log_export(source: str = 'All', level: str = 'All'):
        events = log_service.list_events(source=source, level=level, limit=0, include_details=True)
        return PlainTextResponse(log_service.export_text(events))

    @router.get('/debug/summary')
    def debug_summary():
        snapshot = debug_service.snapshot()
        snapshot['unified_log'] = {'size': len(log_service.list_events(limit=0)), 'verbose': log_service.verbose}
        return snapshot

    @router.get('/icons/{icon_asset_id:path}')
    def icon_proxy(icon_asset_id: str):
        icon_asset_id = unquote(icon_asset_id)
        itempanel_content = itempanel_icon_catalog.read_icon(icon_asset_id)
        if itempanel_content is not None:
            return Response(content=itempanel_content, media_type='image/png')
        candidate = asset_index.icon_assets.get(icon_asset_id)
        if candidate is None:
            parsed = asset_index.parse_asset_id(icon_asset_id)
            if parsed is not None:
                source, rel_path = parsed
                for entries in asset_index.icons.values():
                    found = next((entry for entry in entries if entry.get('source_type') == source and entry.get('path') == rel_path), None)
                    if found is not None:
                        candidate = found
                        break
        if candidate is None:
            raise HTTPException(status_code=404, detail='Icon asset not found')

        locator = candidate.get('locator') or {}
        content: Optional[bytes] = None
        try:
            if locator.get('kind') == 'file':
                file_path = Path(str(locator.get('file_path', '')))
                if file_path.is_file():
                    content = file_path.read_bytes()
            elif locator.get('kind') == 'archive_entry':
                archive_path = Path(str(locator.get('archive_path', '')))
                entry_path = str(locator.get('entry_path', ''))
                if archive_path.is_file() and entry_path:
                    with ZipFile(archive_path) as archive:
                        content = archive.read(entry_path)
        except Exception as exc:
            log_service.log('BACKEND', 'ERROR', 'ICON', 'Icon binary read failed', {'icon_asset_id': icon_asset_id, 'error': str(exc), 'error_type': exc.__class__.__name__})
            raise HTTPException(status_code=500, detail='Icon binary read failed') from exc
        if content is None:
            raise HTTPException(status_code=404, detail='Icon binary is unavailable for this asset')
        return Response(content=content, media_type='image/png')

    session_secret = os.environ.get('AUTH_SESSION_SECRET', '').strip()
    if not session_secret:
        auth_service.configuration_error = auth_service.configuration_error or 'AUTH_SESSION_SECRET is required for authentication'

    app = FastAPI(title='CubixRecipes API')
    cors_origins = _cors_origins()

    @app.middleware('http')
    async def require_authenticated_api(request: Request, call_next):
        path = request.url.path
        if request.method.upper() == 'OPTIONS':
            return await call_next(request)
        if not path.startswith('/api') or _is_public_api_path(path):
            return await call_next(request)
        if not auth_service.is_configured:
            return JSONResponse(
                {'detail': auth_service.configuration_error or 'Authentication is not configured', **auth_service.public_config()},
                status_code=503,
            )
        session = _get_request_session(request)
        user_id = session.get('user_id')
        if user_id is None:
            return JSONResponse({'detail': 'Authentication required'}, status_code=401)
        try:
            user = auth_service.get_user(int(user_id))
        except Exception:
            session.clear()
            return JSONResponse({'detail': 'Authentication required'}, status_code=401)
        if user is None:
            session.clear()
            return JSONResponse({'detail': 'Authentication required'}, status_code=401)
        user_payload = user.as_dict()
        if not access_control_store.is_allowed(user_payload):
            return JSONResponse({'detail': 'Account is not whitelisted', 'whitelist_enabled': True}, status_code=403)
        permission = permission_for_request(request.method, path)
        if not role_has_permission(user.role, permission, user.email):
            return JSONResponse({'detail': 'Forbidden', 'permission': permission}, status_code=403)
        request.state.auth_user = user_payload
        return await call_next(request)

    if session_secret:
        try:
            from starlette.middleware.sessions import SessionMiddleware
        except Exception as exc:
            auth_service.configuration_error = f'itsdangerous is required for session cookies: {exc}'
            SessionMiddleware = None  # type: ignore[assignment]
        app_public_url = os.environ.get('APP_PUBLIC_URL', '').strip().lower()
        cookie_secure = os.environ.get('AUTH_COOKIE_SECURE', '').strip().lower()
        same_site = _cookie_same_site()
        https_only = (
            same_site == 'none'
            or cookie_secure in {'1', 'true', 'yes', 'on'}
            or (not cookie_secure and app_public_url.startswith('https://'))
        )
        if SessionMiddleware is not None:
            app.add_middleware(SessionMiddleware, secret_key=session_secret, same_site=same_site, https_only=https_only)

    if cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins,
            allow_credentials=True,
            allow_methods=['*'],
            allow_headers=['*'],
        )

    @app.get('/health')
    def health_check():
        return {'ok': True}

    app.include_router(router)
    return app
