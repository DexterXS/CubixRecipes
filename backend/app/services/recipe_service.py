from __future__ import annotations

from typing import Optional

from app.domain.models import Recipe, RecipeCell, RecipeSource
from app.parsers.recipe_parser import RecipeParser
from app.storage.zs_storage import ZsStorage


class RecipeService:
    def __init__(self, storage: ZsStorage, parser: RecipeParser):
        self.storage = storage
        self.parser = parser

    def parse_text(self, text: str):
        return self.parser.parse(text)

    def create_recipe(self, recipe_type: str, output_raw: Optional[str] = None, grid: int = 3) -> Recipe:
        output = self.parser.parse_item_ref(output_raw or "<minecraft:stone>")
        size = 9 if recipe_type == "avaritia_extreme_shaped" else grid
        matrix = [
            [RecipeCell(row=r, col=c, raw=None, item=None) for c in range(size)]
            for r in range(size)
        ]
        return Recipe(
            recipe_uid="new-recipe",
            recipe_type=recipe_type,
            output=output,
            matrix=matrix,
            grid_w=size,
            grid_h=size,
            source=RecipeSource(kind="generated"),
            raw_text="",
            diagnostics=[],
        )

    def render_recipe(self, recipe: Recipe) -> str:
        rows = []
        for row in recipe.matrix:
            rendered = ", ".join(cell.raw if cell.raw is not None else "null" for cell in row)
            rows.append(f"[{rendered}]")
        matrix = "[" + ", ".join(rows) + "]"
        if recipe.recipe_type == "avaritia_extreme_shaped":
            return f"mods.avaritia.ExtremeCrafting.addShaped({recipe.output.raw}, {matrix});"
        if recipe.name:
            return f'recipes.addShaped("{recipe.name}", {recipe.output.raw}, {matrix});'
        return f"recipes.addShaped({recipe.output.raw}, {matrix});"
