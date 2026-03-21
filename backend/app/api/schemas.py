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
