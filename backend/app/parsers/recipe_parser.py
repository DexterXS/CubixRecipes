from __future__ import annotations

import ast
import hashlib
import re
from dataclasses import dataclass
from typing import Optional

from app.domain.models import BindingMode, ItemRef, MetaMode, Recipe, RecipeCell, RecipeSource

ITEM_RE = re.compile(r"^<([a-zA-Z0-9_\-.]+):([a-zA-Z0-9_\-/\.]+)(?::([0-9*]+))?>(?:\.withTag\(([\s\S]*)\))?$")
CALL_PREFIXES = (
    'recipes.addShaped',
    'recipes.addShapeless',
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
        if self._looks_like_item_query(stripped) and '.addShaped' not in stripped and '.addShapeless' not in stripped:
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

    def normalize_editor_matrix(
        self,
        matrix: list[list[Optional[str]]],
        recipe_type: str,
        binding_mode: BindingMode | str = BindingMode.SOFT,
    ) -> list[list[Optional[str]]]:
        normalized = [[self._normalize_cell_value(cell) for cell in row] for row in matrix]
        normalized_binding = self._coerce_binding_mode(binding_mode)
        if recipe_type == 'avaritia_extreme_shaped':
            size = max(9, len(normalized), max((len(row) for row in normalized), default=0))
            normalized = [list(row[:size]) + [None] * max(0, size - len(row)) for row in normalized[:size]]
            while len(normalized) < size:
                normalized.append([None] * size)
            return normalized

        if recipe_type == 'ct_shapeless' or normalized_binding == BindingMode.STRICT:
            return self._pad_matrix(normalized)

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
        binding_mode: BindingMode | str = BindingMode.SOFT,
    ) -> Recipe:
        normalized_binding = self._coerce_binding_mode(binding_mode)
        normalized = self.normalize_editor_matrix(matrix, recipe_type, normalized_binding)
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
            binding_mode=normalized_binding,
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
        recipe_call = self._extract_recipe_call(text)
        remove_template = self._extract_remove_template(text, recipe_call)
        func, args = self._split_call(recipe_call)
        if 'mods.avaritia.ExtremeCrafting.addShaped' in func:
            recipe_type = 'avaritia_extreme_shaped'
        elif 'recipes.addShapeless' in func:
            recipe_type = 'ct_shapeless'
        else:
            recipe_type = 'ct_shaped'
        parsed_args = self._split_top_level_args(args)
        if len(parsed_args) < 2:
            raise ValueError('Recipe call must contain at least output and recipe body')

        name = None
        start_index = 0
        if parsed_args[0].startswith('"'):
            name = ast.literal_eval(parsed_args[0])
            start_index = 1

        output_raw = parsed_args[start_index].strip()
        recipe_body = parsed_args[start_index + 1 :]
        if recipe_type == 'ct_shapeless':
            matrix, diagnostics = self._parse_shapeless_body(recipe_body)
        else:
            matrix, diagnostics = self._parse_recipe_body(recipe_body)
        recipe = self.build_recipe_from_matrix(
            recipe_type=recipe_type,
            output_raw=output_raw,
            matrix=matrix,
            source_kind=source_kind,
            name=name,
            recipe_uid=hashlib.sha1(text.encode('utf-8')).hexdigest()[:12],
            binding_mode=BindingMode.SOFT,
        )
        recipe.raw_text = text
        recipe.diagnostics.extend(diagnostics)
        recipe.remove_template = remove_template
        return recipe

    def _extract_recipe_call(self, text: str) -> str:
        candidates = [(index, prefix) for prefix in CALL_PREFIXES if (index := text.find(prefix)) >= 0]
        if not candidates:
            raise ValueError('Recipe call is missing')
        call_start, prefix = min(candidates, key=lambda item: item[0])
        open_index = text.find('(', call_start + len(prefix))
        if open_index < 0:
            raise ValueError('Recipe call is missing opening parenthesis')
        close_index = self._find_matching_paren(text, open_index)
        if close_index is None:
            raise ValueError('Recipe call is missing closing parenthesis')
        end_index = close_index + 1
        while end_index < len(text) and text[end_index].isspace():
            end_index += 1
        if end_index < len(text) and text[end_index] == ';':
            end_index += 1
        return text[call_start:end_index].strip()

    def _extract_remove_template(self, text: str, recipe_call: str) -> Optional[str]:
        call_index = text.find(recipe_call)
        if call_index <= 0:
            return None
        prefix = text[:call_index].strip()
        if not prefix:
            return None
        matches = list(re.finditer(r'recipes\.remove\((?P<body>[\s\S]*?)\)\s*;', prefix))
        if not matches:
            return None
        trailing = prefix[matches[-1].end():].strip()
        if trailing:
            return None
        return matches[-1].group(0).strip()

    def _parse_shapeless_body(self, recipe_body: list[str]) -> tuple[list[list[Optional[str]]], list[str]]:
        if not recipe_body:
            raise ValueError('Recipe body is empty')
        first = recipe_body[0].strip()
        tokens = self._split_list_items(first) if first.startswith('[') else recipe_body
        ingredients = [self._parse_mapping_value(token) for token in tokens]
        if not ingredients:
            return [[None, None], [None, None]], []
        size = 2 if len(ingredients) <= 4 else 3
        matrix: list[list[Optional[str]]] = []
        for row_index in range(size):
            row: list[Optional[str]] = []
            for col_index in range(size):
                row.append(ingredients[row_index * size + col_index] if row_index * size + col_index < len(ingredients) else None)
            matrix.append(row)
        return matrix, []

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
        item_ref = self._extract_item_reference(normalized)
        if item_ref:
            return item_ref
        raise ValueError(f'Unsupported recipe key value: {raw}')

    def _parse_output_item(self, output_raw: str) -> ItemRef:
        item_match = re.search(r'<[^>]+>', output_raw)
        if not item_match:
            raise ValueError(f'Cannot parse output item from: {output_raw}')
        return self.parse_item_ref(item_match.group(0))

    def _parse_matrix(self, matrix_raw: str) -> list[list[Optional[str]]]:
        rows_raw = self._split_list_items(matrix_raw)
        matrix: list[list[Optional[str]]] = []
        for row_raw in rows_raw:
            row_text = row_raw.strip()
            if not row_text.startswith('['):
                raise ValueError('Recipe matrix rows must be lists')
            matrix.append([self._parse_matrix_cell_value(cell_raw) for cell_raw in self._split_list_items(row_text)])
        return matrix

    def _split_list_items(self, list_raw: str) -> list[str]:
        normalized = list_raw.strip()
        if not normalized.startswith('[') or not normalized.endswith(']'):
            raise ValueError('Recipe matrix must be a list')
        inner = normalized[1:-1].strip()
        if not inner:
            return []
        return self._split_top_level_args(inner)

    def _parse_matrix_cell_value(self, raw: str) -> Optional[str]:
        normalized = raw.strip()
        if not normalized or normalized in {'null', 'None'}:
            return None
        item_ref = self._extract_item_reference(normalized)
        if item_ref:
            return item_ref
        if normalized.startswith(("'", '"')):
            try:
                value = ast.literal_eval(normalized)
            except (SyntaxError, ValueError):
                return normalized
            return self._normalize_cell_value(value)
        return normalized

    def _extract_item_reference(self, raw: str) -> Optional[str]:
        item_match = re.search(r'<[^>]+>', raw)
        if not item_match:
            return None

        item_end = item_match.end()
        suffix = raw[item_end:]
        suffix_stripped = suffix.lstrip()
        if not suffix_stripped.startswith('.withTag('):
            return item_match.group(0)

        suffix_offset = item_end + (len(suffix) - len(suffix_stripped))
        open_paren_index = suffix_offset + len('.withTag')
        close_paren_index = self._find_matching_paren(raw, open_paren_index)
        if close_paren_index is None:
            return item_match.group(0)
        return raw[item_match.start() : close_paren_index + 1].strip()

    def _find_matching_paren(self, text: str, open_index: int) -> Optional[int]:
        if open_index >= len(text) or text[open_index] != '(':
            return None

        depth = 0
        in_string = False
        string_quote = ''
        escape = False
        for index in range(open_index, len(text)):
            char = text[index]
            if escape:
                escape = False
                continue
            if char == '\\':
                escape = True
                continue
            if char in {'"', "'"}:
                if in_string and char == string_quote:
                    in_string = False
                    string_quote = ''
                elif not in_string:
                    in_string = True
                    string_quote = char
                continue
            if in_string:
                continue
            if char == '(':
                depth += 1
            elif char == ')':
                depth -= 1
                if depth == 0:
                    return index
        return None

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

    def _coerce_binding_mode(self, binding_mode: BindingMode | str) -> BindingMode:
        if isinstance(binding_mode, BindingMode):
            return binding_mode
        try:
            return BindingMode(str(binding_mode))
        except ValueError:
            return BindingMode.SOFT

    def _pad_matrix(self, matrix: list[list[Optional[str]]]) -> list[list[Optional[str]]]:
        if not matrix:
            return [[None]]
        width = max(1, max((len(row) for row in matrix), default=1))
        padded = [list(row) + [None] * max(0, width - len(row)) for row in matrix]
        return padded or [[None]]

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
