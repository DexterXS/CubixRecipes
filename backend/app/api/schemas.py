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
    templateType: Literal['ct_shaped', 'avaritia_extreme_shaped']
    output: Optional[str] = None
    grid: int = Field(default=3, ge=1, le=9)


class SaveAsRequest(BaseModel):
    recipe_uid: str
    recipe_type: Literal['ct_shaped', 'avaritia_extreme_shaped']
    output_raw: str
    matrix: list[list[Optional[str]]] = Field(min_length=1, max_length=9)
    name: Optional[str] = None
    target_path: str

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


class IndexScanRequest(BaseModel):
    full: bool = True
    paths: list[str] = Field(default_factory=list)


class CreateFileRequest(BaseModel):
    path: str


class CloudFileRequest(BaseModel):
    path: str


class RenameCloudFileRequest(BaseModel):
    path: str
    new_name: str = Field(min_length=1, max_length=255)


class UpdateRecipeRequest(BaseModel):
    recipe_type: Literal['ct_shaped', 'avaritia_extreme_shaped']
    output_raw: str
    matrix: list[list[Optional[str]]] = Field(min_length=1, max_length=9)
    name: Optional[str] = None

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


class UiPreferencesRequest(BaseModel):
    display_mode: Literal['text', 'icons'] = 'text'
    animations_enabled: bool = True
    density_mode: Literal['compact', 'normal', 'wide'] = 'normal'
    editor_mode: Literal['view', 'edit'] = 'edit'
    ui_scale: float = 1.15
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


class DebugLogEventRequest(BaseModel):
    source: str = 'FRONTEND'
    level: str = 'INFO'
    category: str = 'CLIENT'
    message: str
    details: dict = Field(default_factory=dict)
    verbose_only: bool = False
