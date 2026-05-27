from __future__ import annotations

from typing import Optional

from app.domain.models import BindingMode, Recipe
from app.parsers.recipe_parser import RecipeParser
from app.storage.zs_storage import ZsStorage


class RecipeService:
    def __init__(self, storage: ZsStorage, parser: RecipeParser):
        self.storage = storage
        self.parser = parser

    def parse_text(self, text: str):
        return self.parser.parse(text)

    def create_recipe(
        self,
        recipe_type: str,
        output_raw: Optional[str] = None,
        grid: int = 3,
        binding_mode: BindingMode | str = BindingMode.SOFT,
    ) -> Recipe:
        size = 9 if recipe_type == 'avaritia_extreme_shaped' else max(1, grid)
        matrix = [[None for _ in range(size)] for _ in range(size)]
        return self.parser.build_recipe_from_matrix(
            recipe_type=recipe_type,
            output_raw=output_raw or '<minecraft:stone>',
            matrix=matrix,
            source_kind='generated',
            recipe_uid='new-recipe',
            binding_mode=binding_mode,
        )

    def update_recipe(
        self,
        recipe: Recipe,
        output_raw: str,
        matrix: list[list[Optional[str]]],
        name: Optional[str],
        binding_mode: BindingMode | str | None = None,
        recipe_type: Optional[str] = None,
    ) -> Recipe:
        next_recipe = self.parser.build_recipe_from_matrix(
            recipe_type=recipe_type or recipe.recipe_type,
            output_raw=output_raw,
            matrix=matrix,
            source_kind=recipe.source.kind,
            name=name,
            recipe_uid=recipe.recipe_uid,
            source_path=recipe.source.path,
            binding_mode=binding_mode or recipe.binding_mode,
        )
        next_recipe.source.start_offset = recipe.source.start_offset
        next_recipe.source.end_offset = recipe.source.end_offset
        return next_recipe

    def render_recipe(self, recipe: Recipe) -> str:
        if recipe.recipe_type == 'ct_shapeless':
            ingredients = [cell.raw for row in recipe.matrix for cell in row if cell.raw is not None]
            ingredient_list = '[' + ', '.join(ingredients) + ']'
            if recipe.name:
                return f'recipes.addShapeless("{recipe.name}", {recipe.output.raw}, {ingredient_list});'
            return f'recipes.addShapeless({recipe.output.raw}, {ingredient_list});'

        rows = []
        for row in recipe.matrix:
            rendered = ', '.join(cell.raw if cell.raw is not None else 'null' for cell in row)
            rows.append(f"[{rendered}]")
        matrix = '[' + ', '.join(rows) + ']'
        if recipe.recipe_type == 'avaritia_extreme_shaped':
            return f'mods.avaritia.ExtremeCrafting.addShaped({recipe.output.raw}, {matrix});'
        if recipe.name:
            return f'recipes.addShaped("{recipe.name}", {recipe.output.raw}, {matrix});'
        return f'recipes.addShaped({recipe.output.raw}, {matrix});'
