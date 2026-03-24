from __future__ import annotations

from .base import ModAssetParser, TextureContext


class AvaritiaModAssetParser(ModAssetParser):
    mod_id = 'avaritia'

    def build_item_names(self, context: TextureContext) -> list[str]:
        names = super().build_item_names(context)
        if context.texture_path.count('/') == 1:
            base, tail = context.texture_path.split('/', 1)
            if tail.isdigit():
                names.append(f'{base}_{tail}')
        return list(dict.fromkeys(names))
