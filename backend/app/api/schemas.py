from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class ParseRequest(BaseModel):
    text: str


class SearchRequest(BaseModel):
    output_item_raw: str


class CreateRecipeRequest(BaseModel):
    templateType: str
    output: Optional[str] = None
    grid: int = 3


class SaveAsRequest(BaseModel):
    recipe_uid: str
    recipe_type: str
    output_raw: str
    matrix: list[list[Optional[str]]]
    name: Optional[str] = None
    target_path: str


class ResolveRequest(BaseModel):
    item_raw: str
    settings: dict = Field(default_factory=dict)


class IndexScanRequest(BaseModel):
    full: bool = True
    paths: list[str] = Field(default_factory=list)


class CreateFileRequest(BaseModel):
    path: str


class UpdateRecipeRequest(BaseModel):
    recipe_type: str
    output_raw: str
    matrix: list[list[Optional[str]]]
    name: Optional[str] = None


class PanelLayoutItemRequest(BaseModel):
    id: str
    zone: Literal['topLeft', 'topRight', 'bottom', 'sidebar'] = 'bottom'
    order: int = 0
    visible: bool = True
    height: Optional[int] = None


class WorkspaceLayoutRequest(BaseModel):
    top_ratio: int = 55
    main_ratio: int = 68


class UiPreferencesRequest(BaseModel):
    display_mode: Literal['text', 'icons'] = 'text'
    density_mode: Literal['compact', 'normal', 'wide'] = 'normal'
    editor_mode: Literal['view', 'edit'] = 'edit'
    language: Literal['ru', 'en'] = 'ru'
    active_view_tab: Literal['editor', 'preview', 'diagnostics', 'raw'] = 'editor'
    reset_layout_version: int = 2
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


class DebugLogEventRequest(BaseModel):
    source: str = 'FRONTEND'
    level: str = 'INFO'
    category: str = 'CLIENT'
    message: str
    details: dict = Field(default_factory=dict)
    verbose_only: bool = False
