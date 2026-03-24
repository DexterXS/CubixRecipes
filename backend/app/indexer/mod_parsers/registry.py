from __future__ import annotations

from .avaritia import AvaritiaModAssetParser
from .base import ModAssetParser
from .contenttweaker import ContentTweakerModAssetParser
from .default import DefaultModAssetParser


class ModParserRegistry:
    def __init__(self) -> None:
        self._default = DefaultModAssetParser()
        self._parsers: dict[str, ModAssetParser] = {
            'avaritia': AvaritiaModAssetParser(),
            'contenttweaker': ContentTweakerModAssetParser(),
        }

    def resolve(self, namespace: str) -> ModAssetParser:
        return self._parsers.get(namespace.lower(), self._default)
