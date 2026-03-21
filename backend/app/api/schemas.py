from __future__ import annotations

from typing import Optional

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


class ProjectSettingsRequest(BaseModel):
    scripts_dir: str = 'scripts'
    mods_dir: str = ''
    assets_dir: str = ''
    recipe_db_path: str = ''
    extra_icon_sources: list[str] = Field(default_factory=list)
    extra_recipe_sources: list[str] = Field(default_factory=list)
    verbose_debug_logging: bool = False


class DebugLogEventRequest(BaseModel):
    source: str = 'FRONTEND'
    level: str = 'INFO'
    category: str = 'CLIENT'
    message: str
    details: dict = Field(default_factory=dict)
    verbose_only: bool = False
