from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class TextureContext:
    namespace: str
    texture_path: str
    texture_kind: str


class ModAssetParser:
    """Base parser for deriving logical item keys from texture file paths."""

    mod_id = '*'

    def build_item_names(self, context: TextureContext) -> list[str]:
        texture_name = context.texture_path[:-4] if context.texture_path.endswith('.png') else context.texture_path
        normalized = texture_name.strip('/').lower()
        if not normalized:
            return []
        names: list[str] = [normalized]
        if '/' in normalized:
            names.append(normalized.split('/')[-1])
            names.append(normalized.replace('/', '_'))
        return list(dict.fromkeys(name for name in names if name))
