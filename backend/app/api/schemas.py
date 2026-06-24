from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator


class ParseRequest(BaseModel):
    text: str


class SearchRequest(BaseModel):
    output_item_raw: str


class IngredientSearchRequest(BaseModel):
    item_raw: str


class BatchSearchRequest(BaseModel):
    output_item_raws: list[str] = Field(default_factory=list, max_length=300)


class CreateRecipeRequest(BaseModel):
    templateType: Literal['ct_shaped', 'ct_shapeless', 'avaritia_extreme_shaped']
    output: Optional[str] = None
    grid: int = Field(default=3, ge=1, le=9)
    bindingMode: Literal['soft', 'strict'] = 'soft'


class SaveAsRequest(BaseModel):
    recipe_uid: str
    recipe_type: Literal['ct_shaped', 'ct_shapeless', 'avaritia_extreme_shaped']
    output_raw: str
    matrix: list[list[Optional[str]]] = Field(min_length=1, max_length=9)
    name: Optional[str] = None
    target_path: str
    binding_mode: Literal['soft', 'strict'] = 'soft'
    remove_template: Optional[str] = Field(default=None, max_length=4096)

    @field_validator('matrix')
    @classmethod
    def validate_matrix(cls, matrix: list[list[Optional[str]]]) -> list[list[Optional[str]]]:
        if not matrix:
            raise ValueError('Matrix cannot be empty')
        if len(matrix) > 9:
            raise ValueError('Matrix height must not exceed 9 rows')
        for row in matrix:
            if len(row) > 9:
                raise ValueError('Matrix width must not exceed 9 columns')
        return matrix


class ResolveRequest(BaseModel):
    item_raw: str
    settings: dict = Field(default_factory=dict)


class CustomItemRequest(BaseModel):
    id: Optional[int] = None
    scope: Literal['global', 'user'] = 'user'
    source_raw: str = Field(min_length=1, max_length=1024)
    item_raw: str = Field(min_length=1, max_length=1024)
    display_name: str = Field(min_length=1, max_length=255)
    nbt_raw: Optional[str] = Field(default=None, max_length=8192)
    comment: str = Field(default='', max_length=2048)


class RecipeDraftTemplateRequest(BaseModel):
    outputRaw: str = Field(min_length=1, max_length=1024)
    recipe: dict
    sourceText: str = Field(min_length=1, max_length=180_000)
    name: str = Field(min_length=1, max_length=255)


class RecipeTaskRequest(BaseModel):
    itemRaw: str = Field(default='', max_length=1024)
    itemTitle: str = Field(default='', max_length=255)
    title: str = Field(min_length=1, max_length=255)
    description: str = Field(default='', max_length=8192)
    status: Literal['planned', 'in_progress', 'review', 'done'] = 'planned'
    priority: Literal['low', 'normal', 'high', 'urgent'] = 'normal'
    estimatedDays: int = Field(default=1, ge=1, le=365)
    deadlineDate: str = Field(default='', max_length=10)
    assigneeEmail: str = Field(default='', max_length=255)
    helperEmails: list[str] = Field(default_factory=list, max_length=12)
    sortOrder: int = Field(default=0, ge=0)


class RecipeTaskPatchRequest(BaseModel):
    itemRaw: Optional[str] = Field(default=None, max_length=1024)
    itemTitle: Optional[str] = Field(default=None, max_length=255)
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = Field(default=None, max_length=8192)
    status: Optional[Literal['planned', 'in_progress', 'review', 'done']] = None
    priority: Optional[Literal['low', 'normal', 'high', 'urgent']] = None
    estimatedDays: Optional[int] = Field(default=None, ge=1, le=365)
    deadlineDate: Optional[str] = Field(default=None, max_length=10)
    assigneeEmail: Optional[str] = Field(default=None, max_length=255)
    helperEmails: Optional[list[str]] = Field(default=None, max_length=12)
    sortOrder: Optional[int] = Field(default=None, ge=0)


class RecipeTaskOrderItemRequest(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    status: Literal['planned', 'in_progress', 'review', 'done']
    sortOrder: int = Field(ge=0)


class RecipeTaskOrderRequest(BaseModel):
    tasks: list[RecipeTaskOrderItemRequest] = Field(default_factory=list, max_length=2000)


class RecipeTaskBoardRequest(BaseModel):
    boardMode: Literal['free', 'priority', 'deadline', 'created'] = 'free'


class NeiFavoriteItemRequest(BaseModel):
    raw: str = Field(min_length=1, max_length=4096)
    addedAt: int = Field(default=0, ge=0)


class NeiFavoriteTabRequest(BaseModel):
    id: str = Field(default='', max_length=64)
    name: str = Field(default='Основное', max_length=64)
    items: list[NeiFavoriteItemRequest] = Field(default_factory=list, max_length=512)


class NeiFavoritesRequest(BaseModel):
    activeTabId: str = Field(default='', max_length=64)
    favoriteHotkey: str = Field(default='A', max_length=32)
    hiddenPatterns: list[str] = Field(default_factory=list, max_length=200)
    tabs: list[NeiFavoriteTabRequest] = Field(default_factory=list, max_length=32)


class IndexScanRequest(BaseModel):
    full: bool = True
    paths: list[str] = Field(default_factory=list)


class CreateFileRequest(BaseModel):
    path: str


class CloudFileRequest(BaseModel):
    path: str


class UploadCloudFileRequest(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    text: str
    mode: Literal['fail', 'overwrite', 'append'] = 'fail'


class RenameCloudFileRequest(BaseModel):
    path: str
    new_name: str = Field(min_length=1, max_length=255)


class UpdateRecipeRequest(BaseModel):
    recipe_type: Literal['ct_shaped', 'ct_shapeless', 'avaritia_extreme_shaped']
    output_raw: str
    matrix: list[list[Optional[str]]] = Field(min_length=1, max_length=9)
    name: Optional[str] = None
    binding_mode: Literal['soft', 'strict'] = 'soft'
    remove_template: Optional[str] = Field(default=None, max_length=4096)

    @field_validator('matrix')
    @classmethod
    def validate_matrix(cls, matrix: list[list[Optional[str]]]) -> list[list[Optional[str]]]:
        if not matrix:
            raise ValueError('Matrix cannot be empty')
        if len(matrix) > 9:
            raise ValueError('Matrix height must not exceed 9 rows')
        for row in matrix:
            if len(row) > 9:
                raise ValueError('Matrix width must not exceed 9 columns')
        return matrix


class PanelLayoutItemRequest(BaseModel):
    id: str
    zone: Literal['topLeft', 'topRight', 'bottom', 'sidebar'] = 'bottom'
    order: int = 0
    visible: bool = True
    height: Optional[int] = None
    width_units: int = 1


class WorkspaceLayoutRequest(BaseModel):
    columns: Literal[1, 2, 3] = 3
    compact_header: bool = True
    extreme_grid_gap: int = Field(default=8, ge=0, le=24)


class UiPreferencesRequest(BaseModel):
    display_mode: Literal['text', 'icons'] = 'text'
    animations_enabled: bool = True
    density_mode: Literal['compact', 'normal', 'wide'] = 'normal'
    editor_mode: Literal['view', 'edit'] = 'edit'
    ui_scale: float = 1.15
    nei_page_size: int = Field(default=128, ge=16, le=512)
    language: Literal['ru', 'en'] = 'ru'
    active_view_tab: Literal['editor', 'preview', 'diagnostics', 'raw'] = 'editor'
    reset_layout_version: int = 4
    panel_layout: list[PanelLayoutItemRequest] = Field(default_factory=list)
    workspace_layout: WorkspaceLayoutRequest = Field(default_factory=WorkspaceLayoutRequest)


class ProjectSettingsRequest(BaseModel):
    scripts_dir: str = 'scripts'
    mods_dir: str = ''
    assets_dir: str = ''
    recipe_db_path: str = ''
    extra_icon_sources: list[str] = Field(default_factory=list)
    extra_recipe_sources: list[str] = Field(default_factory=list)
    verbose_debug_logging: bool = False
    ui_preferences: UiPreferencesRequest = Field(default_factory=UiPreferencesRequest)


class RoleUpdateRequest(BaseModel):
    role: Literal['admin', 'moderator', 'default']


class AccessControlRequest(BaseModel):
    whitelist_enabled: bool = False
    whitelist_emails: list[str] = Field(default_factory=list, max_length=500)


class ItemCaseAliasManualRequest(BaseModel):
    lower_key: str = Field(min_length=1, max_length=255)
    original: str = Field(min_length=1, max_length=255)


class DebugLogEventRequest(BaseModel):
    source: str = 'FRONTEND'
    level: str = 'INFO'
    category: str = 'CLIENT'
    message: str
    details: dict = Field(default_factory=dict)
    verbose_only: bool = False


class ModReplacementRequest(BaseModel):
    modid: str
    replacements: dict[str, str] = Field(default_factory=dict)

