from __future__ import annotations

from typing import Optional

from app.domain.models import BindingMode, ItemRef, Recipe
from app.parsers.recipe_parser import RecipeParser
from app.storage.zs_storage import ZsStorage


ALLOWED_REMOVE_TEMPLATE_PREFIXES = (
    'recipes.remove(',
    'recipes.removeShaped(',
    'recipes.removeShapeless(',
)


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
        remove_template: Optional[str] = None,
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
        next_recipe.remove_template = remove_template if remove_template is not None else recipe.remove_template
        return next_recipe

    def render_recipe(self, recipe: Recipe, remove_template: Optional[str] = None) -> str:
        if recipe.recipe_type == 'ct_shapeless':
            ingredients = [cell.raw for row in recipe.matrix for cell in row if cell.raw is not None]
            ingredient_list = '[' + ', '.join(ingredients) + ']'
            if recipe.name:
                rendered_recipe = f'recipes.addShapeless("{recipe.name}", {recipe.output.raw}, {ingredient_list});'
            else:
                rendered_recipe = f'recipes.addShapeless({recipe.output.raw}, {ingredient_list});'
            return self._with_remove_template(recipe, rendered_recipe, remove_template)

        matrix = self._render_matrix(recipe)
        if recipe.recipe_type == 'avaritia_extreme_shaped':
            rendered_recipe = f'mods.avaritia.ExtremeCrafting.addShaped({recipe.output.raw}, {matrix});'
        elif recipe.name:
            rendered_recipe = f'recipes.addShaped("{recipe.name}", {recipe.output.raw}, {matrix});'
        else:
            rendered_recipe = f'recipes.addShaped({recipe.output.raw}, {matrix});'
        return self._with_remove_template(recipe, rendered_recipe, remove_template)

    def _render_matrix(self, recipe: Recipe) -> str:
        rows = []
        for index, row in enumerate(recipe.matrix):
            rendered = ', '.join(cell.raw if cell.raw is not None else 'null' for cell in row)
            comma = ',' if index < len(recipe.matrix) - 1 else ''
            rows.append(f'  [{rendered}]{comma}')
        return '[\n' + '\n'.join(rows) + '\n]'

    def _with_remove_template(self, recipe: Recipe, rendered_recipe: str, remove_template: Optional[str]) -> str:
        template = remove_template if remove_template is not None else recipe.remove_template
        remove_line = self.render_remove_template(template, recipe)
        if not remove_line:
            return rendered_recipe
        return f'{remove_line}\n{rendered_recipe}'

    def render_remove_template(self, template: Optional[str], recipe: Recipe) -> str:
        normalized = (template or '').strip()
        if not normalized or normalized == 'none':
            return ''
        normalized = normalized.replace('\r\n', '\n').replace('\r', '\n')
        if '\n' in normalized:
            raise ValueError('Remove template must be a single statement')
        if not normalized.endswith(';'):
            normalized = f'{normalized};'
        if not normalized.startswith(ALLOWED_REMOVE_TEMPLATE_PREFIXES):
            raise ValueError('Remove template must use recipes.remove, recipes.removeShaped, or recipes.removeShapeless')
        matrix = self._render_matrix(recipe)
        ingredients = '[' + ', '.join(cell.raw for row in recipe.matrix for cell in row if cell.raw is not None) + ']'
        rendered = normalized.format(
            output=recipe.output.raw,
            output_wildcard=self._item_with_meta(recipe.output, '*'),
            output_meta0=self._item_with_meta(recipe.output, '0'),
            matrix=matrix,
            ingredients=ingredients,
        )
        if rendered.count(';') != 1 or not rendered.endswith(';'):
            raise ValueError('Remove template must render to exactly one statement')
        return rendered

    def _item_with_meta(self, item: ItemRef, meta: str) -> str:
        return f'<{item.modid}:{item.name}:{meta}>'
