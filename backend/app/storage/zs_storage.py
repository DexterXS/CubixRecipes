from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

from app.domain.models import Recipe
from app.parsers.recipe_parser import RecipeParser


@dataclass(slots=True)
class StoredRecipe:
    recipe: Recipe
    file_path: str
    start_offset: int
    end_offset: int
    raw_block: str


class ZsStorage:
    def __init__(self, scripts_dir: str | Path):
        self.scripts_dir = Path(scripts_dir)
        self.parser = RecipeParser()
        self._recipes: dict[str, StoredRecipe] = {}
        self._by_output: dict[str, list[str]] = {}

    def scan(self) -> None:
        self._recipes.clear()
        self._by_output.clear()
        self.scripts_dir.mkdir(parents=True, exist_ok=True)
        pattern = re.compile(r"(?:recipes\.addShaped|mods\.avaritia\.ExtremeCrafting\.addShaped)\(.*?\);", re.S)
        for file_path in self.scripts_dir.glob("*.zs"):
            text = file_path.read_text(encoding="utf-8")
            for match in pattern.finditer(text):
                block = match.group(0)
                recipe = self.parser.parse(block, source_kind="zs_file").recipe
                assert recipe is not None
                recipe.source.path = str(file_path)
                recipe.source.start_offset = match.start()
                recipe.source.end_offset = match.end()
                uid = hashlib.sha1(f"{file_path}:{match.start()}".encode()).hexdigest()[:12]
                recipe.recipe_uid = uid
                stored = StoredRecipe(recipe=recipe, file_path=str(file_path), start_offset=match.start(), end_offset=match.end(), raw_block=block)
                self._recipes[uid] = stored
                for key in {recipe.output.raw, recipe.output.base_key}:
                    self._by_output.setdefault(key, []).append(uid)

    def list_files(self) -> list[dict[str, str | int]]:
        return [
            {"path": str(path), "recipeCount": sum(1 for item in self._recipes.values() if item.file_path == str(path))}
            for path in sorted(self.scripts_dir.glob("*.zs"))
        ]

    def search_by_output(self, output_raw: str) -> list[Recipe]:
        try:
            item = self.parser.parse_item_ref(output_raw)
            keys = [output_raw, item.base_key]
        except Exception:
            keys = [output_raw]
        matches = []
        seen: set[str] = set()
        for key in keys:
            for uid in self._by_output.get(key, []):
                if uid not in seen:
                    seen.add(uid)
                    matches.append(self._recipes[uid].recipe)
        return matches

    def get_recipe(self, recipe_uid: str) -> Recipe:
        return self._recipes[recipe_uid].recipe

    def save_existing(self, recipe_uid: str, rendered_block: str) -> Recipe:
        stored = self._recipes[recipe_uid]
        path = Path(stored.file_path)
        text = path.read_text(encoding="utf-8")
        updated = text[: stored.start_offset] + rendered_block + text[stored.end_offset :]
        path.write_text(updated, encoding="utf-8")
        self.scan()
        return self.get_recipe(recipe_uid)

    def save_as(self, rendered_block: str, target_path: str) -> str:
        path = Path(target_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        prefix = "\n" if path.exists() and path.read_text(encoding="utf-8").strip() else ""
        with path.open("a", encoding="utf-8") as handle:
            handle.write(prefix + rendered_block + "\n")
        self.scan()
        latest = max((item for item in self._recipes.values() if item.file_path == str(path)), key=lambda item: item.start_offset)
        return latest.recipe.recipe_uid

    def create_file(self, path: str) -> str:
        file_path = Path(path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.touch(exist_ok=True)
        return str(file_path)
