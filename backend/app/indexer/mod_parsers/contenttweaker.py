from __future__ import annotations

from .base import ModAssetParser, TextureContext


class ContentTweakerModAssetParser(ModAssetParser):
    mod_id = 'contenttweaker'

    def build_item_names(self, context: TextureContext) -> list[str]:
        names = super().build_item_names(context)
        expanded: list[str] = []
        for name in names:
            expanded.append(name)
            if name.startswith('item/'):
                expanded.append(name.removeprefix('item/'))
            if name.startswith('block/'):
                expanded.append(name.removeprefix('block/'))
        return list(dict.fromkeys(expanded))
