from __future__ import annotations

import ast
import hashlib
import re
from dataclasses import dataclass
from typing import Optional

from app.domain.models import ItemRef, MetaMode, Recipe, RecipeCell, RecipeSource

ITEM_RE = re.compile(r"^<([a-zA-Z0-9_\-.]+):([a-zA-Z0-9_\-/\.]+)(?::([0-9*]+))?>(?:\.withTag\(([\s\S]*)\))?$")
CALL_PREFIXES = (
    'recipes.addShaped',
    'mods.avaritia.ExtremeCrafting.addShaped',
)


@dataclass
class ParseResult:
    kind: str
    recipe: Optional[Recipe] = None
    item: Optional[ItemRef] = None
    diagnostics: Optional[list[str]] = None


class RecipeParser:
    def parse(self, text: str, source_kind: str = 'clipboard') -> ParseResult:
        stripped = self._normalize_input_text(text)
        if self._looks_like_item_query(stripped) and '.addShaped' not in stripped:
            return ParseResult(kind='item_query', item=self.parse_item_ref(stripped), diagnostics=[])
        if any(prefix in stripped for prefix in CALL_PREFIXES):
            recipe = self._parse_recipe(stripped, source_kind=source_kind)
            return ParseResult(kind='recipe', recipe=recipe, diagnostics=recipe.diagnostics)
        raise ValueError('Unsupported input format')

    def parse_item_ref(self, raw: str) -> ItemRef:
        match = ITEM_RE.match(raw.strip())
        if not match:
            raise ValueError(f'Invalid item reference: {raw}')
        modid, name, meta, _nbt = match.groups()
        modid = modid.lower()
        name = name.lower()
        if meta is None:
            return ItemRef(raw=raw.strip(), modid=modid, name=name)
        if meta == '*':
            return ItemRef(raw=raw.strip(), modid=modid, name=name, meta_mode=MetaMode.WILDCARD)
        return ItemRef(raw=raw.strip(), modid=modid, name=name, meta_mode=MetaMode.EXACT, meta_value=int(meta))

    def _looks_like_item_query(self, text: str) -> bool:
        return bool(ITEM_RE.match(text.strip()))

    def parse_item_ref_safe(self, raw: str) -> tuple[Optional[ItemRef], Optional[str]]:
        try:
            return self.parse_item_ref(raw), None
        except Exception as exc:
            return None, str(exc)

    def normalize_editor_matrix(self, matrix: list[list[Optional[str]]], recipe_type: str) -> list[list[Optional[str]]]:
        normalized = [[self._normalize_cell_value(cell) for cell in row] for row in matrix]
        if recipe_type == 'avaritia_extreme_shaped':
            size = max(9, len(normalized), max((len(row) for row in normalized), default=0))
            normalized = [list(row[:size]) + [None] * max(0, size - len(row)) for row in normalized[:size]]
            while len(normalized) < size:
                normalized.append([None] * size)
            return normalized

        trimmed = self._trim_empty_edges(normalized)
        if not trimmed:
            return [[None]]
        width = max((len(row) for row in trimmed), default=1)
        return [list(row) + [None] * max(0, width - len(row)) for row in trimmed]

    def build_recipe_from_matrix(
        self,
        recipe_type: str,
        output_raw: str,
        matrix: list[list[Optional[str]]],
        source_kind: str = 'generated',
        name: Optional[str] = None,
        recipe_uid: str = 'new-recipe',
        source_path: Optional[str] = None,
    ) -> Recipe:
        normalized = self.normalize_editor_matrix(matrix, recipe_type)
        diagnostics: list[str] = []
        cells: list[list[RecipeCell]] = []
        for row_index, row in enumerate(normalized):
            cell_row: list[RecipeCell] = []
            for col_index, raw in enumerate(row):
                item = None
                if raw is not None:
                    item, error = self.parse_item_ref_safe(raw)
                    if error:
                        diagnostics.append(f'Cell ({row_index}, {col_index}) failed to parse: {error}')
                cell_row.append(RecipeCell(row=row_index, col=col_index, raw=raw, item=item))
            cells.append(cell_row)

        return Recipe(
            recipe_uid=recipe_uid,
            recipe_type=recipe_type,
            output=self._parse_output_item(output_raw),
            matrix=cells,
            grid_w=max((len(row) for row in normalized), default=0),
            grid_h=len(normalized),
            source=RecipeSource(kind=source_kind, path=source_path),
            raw_text='',
            name=name,
            diagnostics=diagnostics,
        )

    def _normalize_input_text(self, text: str) -> str:
        normalized = text.strip()
        if normalized.startswith('```'):
            fence_match = re.match(r'^```[a-zA-Z0-9_-]*\n(?P<body>[\s\S]*?)\n```$', normalized)
            if fence_match:
                normalized = fence_match.group('body').strip()
        normalized = normalized.replace('\\r\\n', '\n').replace('\\n', '\n').replace('\\t', ' ')
        return normalized.strip()

    def _parse_recipe(self, text: str, source_kind: str) -> Recipe:
        func, args = self._split_call(text)
        recipe_type = 'avaritia_extreme_shaped' if 'mods.avaritia.ExtremeCrafting.addShaped' in func else 'ct_shaped'
        parsed_args = self._split_top_level_args(args)
        if len(parsed_args) < 2:
            raise ValueError('addShaped call must contain at least output and recipe body')

        name = None
        start_index = 0
        if parsed_args[0].startswith('"'):
            name = ast.literal_eval(parsed_args[0])
            start_index = 1

        output_raw = parsed_args[start_index].strip()
        recipe_body = parsed_args[start_index + 1 :]
        matrix, diagnostics = self._parse_recipe_body(recipe_body)
        recipe = self.build_recipe_from_matrix(
            recipe_type=recipe_type,
            output_raw=output_raw,
            matrix=matrix,
            source_kind=source_kind,
            name=name,
            recipe_uid=hashlib.sha1(text.encode('utf-8')).hexdigest()[:12],
        )
        recipe.raw_text = text
        recipe.diagnostics.extend(diagnostics)
        return recipe

    def _parse_recipe_body(self, recipe_body: list[str]) -> tuple[list[list[Optional[str]]], list[str]]:
        if not recipe_body:
            raise ValueError('Recipe body is empty')
        first = recipe_body[0].strip()
        if first.startswith('['):
            return self._parse_matrix(first), []
        return self._parse_pattern_recipe(recipe_body)

    def _parse_pattern_recipe(self, recipe_body: list[str]) -> tuple[list[list[Optional[str]]], list[str]]:
        pattern_rows: list[str] = []
        index = 0
        while index < len(recipe_body):
            token = recipe_body[index].strip()
            if not (token.startswith('"') or token.startswith("'")):
                break
            value = ast.literal_eval(token)
            if not isinstance(value, str):
                break
            remaining = len(recipe_body) - (index + 1)
            if len(value) == 1 and remaining % 2 == 1:
                break
            pattern_rows.append(value)
            index += 1

        if not pattern_rows:
            raise ValueError('Recipe pattern is missing')
        if (len(recipe_body) - index) % 2 != 0:
            raise ValueError('Recipe key mapping must contain character/item pairs')

        mapping: dict[str, Optional[str]] = {' ': None}
        diagnostics: list[str] = []
        while index < len(recipe_body):
            symbol_token = recipe_body[index].strip()
            value_token = recipe_body[index + 1].strip()
            symbol_value = ast.literal_eval(symbol_token)
            if not isinstance(symbol_value, str) or len(symbol_value) != 1:
                raise ValueError(f'Invalid recipe key symbol: {symbol_token}')
            mapping[symbol_value] = self._parse_mapping_value(value_token)
            index += 2

        width = max((len(row) for row in pattern_rows), default=0)
        matrix: list[list[Optional[str]]] = []
        for row_index, row in enumerate(pattern_rows):
            matrix_row: list[Optional[str]] = []
            for col_index in range(width):
                symbol = row[col_index] if col_index < len(row) else ' '
                if symbol not in mapping:
                    diagnostics.append(f"Cell ({row_index}, {col_index}) uses unknown key '{symbol}' and was cleared")
                    matrix_row.append(None)
                    continue
                matrix_row.append(mapping[symbol])
            matrix.append(matrix_row)
        return matrix, diagnostics

    def _parse_mapping_value(self, raw: str) -> Optional[str]:
        normalized = raw.strip()
        if normalized == 'null':
            return None
        item_match = re.search(r'<[^>]+>(?:\.withTag\(([\s\S]*)\))?', normalized)
        if item_match:
            return item_match.group(0)
        raise ValueError(f'Unsupported recipe key value: {raw}')

    def _parse_output_item(self, output_raw: str) -> ItemRef:
        item_match = re.search(r'<[^>]+>', output_raw)
        if not item_match:
            raise ValueError(f'Cannot parse output item from: {output_raw}')
        return self.parse_item_ref(item_match.group(0))

    def _parse_matrix(self, matrix_raw: str) -> list[list[Optional[str]]]:
        transformed = re.sub(r'<([^>]+)>', lambda match: repr(f"<{match.group(1)}>"), matrix_raw)
        transformed = re.sub(r'\bnull\b', 'None', transformed)
        matrix = ast.literal_eval(transformed)
        if not isinstance(matrix, list):
            raise ValueError('Recipe matrix must be a list')
        return [[self._normalize_cell_value(cell) for cell in row] for row in matrix]

    def _split_call(self, text: str) -> tuple[str, str]:
        call_start = text.index('(')
        func = text[:call_start]
        inner = text[call_start + 1 : text.rfind(')')]
        return func.strip(), inner.strip().rstrip(';')

    def _split_top_level_args(self, args: str) -> list[str]:
        result = []
        current = []
        depth = 0
        in_string = False
        string_quote = ''
        escape = False
        for char in args:
            if escape:
                current.append(char)
                escape = False
                continue
            if char == '\\':
                current.append(char)
                escape = True
                continue
            if char in {'"', "'"}:
                if in_string and char == string_quote:
                    in_string = False
                    string_quote = ''
                elif not in_string:
                    in_string = True
                    string_quote = char
                current.append(char)
                continue
            if not in_string:
                if char in '([{<':
                    depth += 1
                elif char in ')]}>':
                    depth -= 1
                elif char == ',' and depth == 0:
                    result.append(''.join(current).strip())
                    current = []
                    continue
            current.append(char)
        if current:
            result.append(''.join(current).strip())
        return result

    def _normalize_cell_value(self, value: Optional[object]) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        if not text or text == 'null':
            return None
        return text

    def _trim_empty_edges(self, matrix: list[list[Optional[str]]]) -> list[list[Optional[str]]]:
        if not matrix:
            return []

        top = 0
        bottom = len(matrix)
        while top < bottom and self._row_is_empty(matrix[top]):
            top += 1
        while bottom > top and self._row_is_empty(matrix[bottom - 1]):
            bottom -= 1
        cropped = [list(row) for row in matrix[top:bottom]]
        if not cropped:
            return []

        max_width = max((len(row) for row in cropped), default=0)
        left = 0
        right = max_width
        while left < right and self._column_is_empty(cropped, left):
            left += 1
        while right > left and self._column_is_empty(cropped, right - 1):
            right -= 1
        return [row[left:right] for row in cropped]

    def _row_is_empty(self, row: list[Optional[str]]) -> bool:
        return all(cell is None for cell in row)

    def _column_is_empty(self, matrix: list[list[Optional[str]]], index: int) -> bool:
        return all(index >= len(row) or row[index] is None for row in matrix)
