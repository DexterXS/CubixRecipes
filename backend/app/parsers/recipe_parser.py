from __future__ import annotations

import ast
import hashlib
import re
from dataclasses import dataclass
from typing import Any

from app.domain.models import ItemRef, MetaMode, Recipe, RecipeCell, RecipeSource

ITEM_RE = re.compile(r"^<([a-zA-Z0-9_\-.]+):([a-zA-Z0-9_\-/\.]+)(?::([0-9*]+))?>$")


@dataclass(slots=True)
class ParseResult:
    kind: str
    recipe: Recipe | None = None
    item: ItemRef | None = None
    diagnostics: list[str] | None = None


class RecipeParser:
    def parse(self, text: str, source_kind: str = "clipboard") -> ParseResult:
        stripped = text.strip()
        if stripped.startswith("<") and stripped.endswith(">") and ".addShaped" not in stripped:
            return ParseResult(kind="item_query", item=self.parse_item_ref(stripped), diagnostics=[])
        if ".addShaped" in stripped:
            recipe = self._parse_recipe(stripped, source_kind=source_kind)
            return ParseResult(kind="recipe", recipe=recipe, diagnostics=recipe.diagnostics)
        raise ValueError("Unsupported input format")

    def parse_item_ref(self, raw: str) -> ItemRef:
        match = ITEM_RE.match(raw.strip())
        if not match:
            raise ValueError(f"Invalid item reference: {raw}")
        modid, name, meta = match.groups()
        if meta is None:
            return ItemRef(raw=raw.strip(), modid=modid, name=name)
        if meta == "*":
            return ItemRef(raw=raw.strip(), modid=modid, name=name, meta_mode=MetaMode.WILDCARD)
        return ItemRef(raw=raw.strip(), modid=modid, name=name, meta_mode=MetaMode.EXACT, meta_value=int(meta))

    def _parse_recipe(self, text: str, source_kind: str) -> Recipe:
        func, args = self._split_call(text)
        recipe_type = "avaritia_extreme_shaped" if "mods.avaritia.ExtremeCrafting.addShaped" in func else "ct_shaped"
        parsed_args = self._split_top_level_args(args)
        name = None
        if parsed_args and parsed_args[0].startswith('"'):
            name = ast.literal_eval(parsed_args[0])
            output_raw = parsed_args[1].strip()
            matrix_raw = parsed_args[2].strip()
        else:
            output_raw = parsed_args[0].strip()
            matrix_raw = parsed_args[1].strip()
        output_item = self._parse_output_item(output_raw)
        matrix = self._parse_matrix(matrix_raw)
        grid_h = len(matrix)
        grid_w = max((len(r) for r in matrix), default=0)
        diagnostics: list[str] = []
        cells: list[list[RecipeCell]] = []
        for r_idx, row in enumerate(matrix):
            normalized = list(row)
            if len(normalized) < grid_w:
                normalized.extend([None] * (grid_w - len(normalized)))
                diagnostics.append(f"Row {r_idx} normalized with trailing null values")
            cell_row = []
            for c_idx, cell in enumerate(normalized):
                item = None if cell is None else self.parse_item_ref(cell)
                cell_row.append(RecipeCell(row=r_idx, col=c_idx, raw=cell, item=item))
            cells.append(cell_row)
        uid = hashlib.sha1(text.encode("utf-8")).hexdigest()[:12]
        return Recipe(
            recipe_uid=uid,
            recipe_type=recipe_type,
            output=output_item,
            matrix=cells,
            grid_w=grid_w,
            grid_h=grid_h,
            source=RecipeSource(kind=source_kind),
            raw_text=text,
            name=name,
            diagnostics=diagnostics,
        )

    def _parse_output_item(self, output_raw: str) -> ItemRef:
        item_match = re.search(r"<[^>]+>", output_raw)
        if not item_match:
            raise ValueError(f"Cannot parse output item from: {output_raw}")
        return self.parse_item_ref(item_match.group(0))

    def _parse_matrix(self, matrix_raw: str) -> list[list[str | None]]:
        transformed = re.sub(r"<([^>]+)>", lambda m: repr(f"<{m.group(1)}>"), matrix_raw)
        transformed = re.sub(r"\bnull\b", "None", transformed)
        matrix = ast.literal_eval(transformed)
        return [[cell for cell in row] for row in matrix]

    def _split_call(self, text: str) -> tuple[str, str]:
        call_start = text.index("(")
        func = text[:call_start]
        inner = text[call_start + 1 : text.rfind(")")]
        return func.strip(), inner.strip().rstrip(";")

    def _split_top_level_args(self, args: str) -> list[str]:
        result = []
        current = []
        depth = 0
        in_string = False
        escape = False
        for char in args:
            if escape:
                current.append(char)
                escape = False
                continue
            if char == "\\":
                current.append(char)
                escape = True
                continue
            if char == '"':
                in_string = not in_string
                current.append(char)
                continue
            if not in_string:
                if char in "([<":
                    depth += 1
                elif char in ")]>":
                    depth -= 1
                elif char == "," and depth == 0:
                    result.append("".join(current).strip())
                    current = []
                    continue
            current.append(char)
        if current:
            result.append("".join(current).strip())
        return result
