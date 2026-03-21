from __future__ import annotations

from typing import Optional

from app.domain.models import ItemRef, ResolutionResult
from app.indexer.asset_index import AssetIndex


class ItemResolver:
    def __init__(self, asset_index: AssetIndex):
        self.asset_index = asset_index
        self.last_resolution_details: dict[str, dict] = {}

    def resolve(self, item_ref: ItemRef, settings: Optional[dict] = None) -> ResolutionResult:
        trace: list[dict] = []
        settings = settings or {}
        key = item_ref.base_key
        checked_keys = [key]
        checked_sources: list[str] = []
        strategies = [
            self._contenttweaker_exact,
            self._textures_exact,
            self._textures_meta_suffix,
            self._grouped_files,
            self._model_texture,
            self._block_texture,
            self._lang_lookup,
            self._manual_override,
        ]
        for strategy in strategies:
            result = strategy(item_ref, key, settings, trace, checked_keys, checked_sources)
            if result is not None:
                self.last_resolution_details[item_ref.raw] = {
                    'source': result.icon_asset_id.split(':', 1)[0] if result.icon_asset_id else 'lang/manual',
                    'checked_sources': checked_sources,
                    'checked_keys': checked_keys,
                    'reason': f'matched via {result.strategy}',
                }
                return result
        result = ResolutionResult(item_raw=item_ref.raw, display_name=item_ref.raw, icon_asset_id=None, icon_url=None, animated=False, confidence=0.1, strategy='placeholder', trace=trace)
        self.last_resolution_details[item_ref.raw] = {
            'source': None,
            'checked_sources': checked_sources,
            'checked_keys': checked_keys,
            'reason': 'No icon, model or lang entry matched the item id',
        }
        return result

    def _contenttweaker_exact(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        candidates = [c for c in self.asset_index.icons.get(key, []) if 'contenttweaker' in c['source_type'].lower()]
        trace.append({'strategy': 'contenttweaker_exact', 'checked': len(candidates)})
        checked_sources.extend([c['source_type'] for c in candidates])
        return self._make_result(item_ref, candidates[:1], 0.95, 'contenttweaker_exact', trace)

    def _textures_exact(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        candidates = self.asset_index.icons.get(key, [])
        trace.append({'strategy': 'textures_exact', 'checked': len(candidates)})
        checked_sources.extend([c['source_type'] for c in candidates])
        return self._make_result(item_ref, candidates[:1], 0.9, 'textures_exact', trace)

    def _textures_meta_suffix(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        if item_ref.meta_value is None:
            trace.append({'strategy': 'textures_meta_suffix', 'checked': 0})
            return None
        suffixes = [f'{item_ref.base_key}_{item_ref.meta_value}', f'{item_ref.base_key}{item_ref.meta_value}']
        checked_keys.extend(suffixes)
        for suffix in suffixes:
            candidates = self.asset_index.icons.get(suffix, [])
            if candidates:
                checked_sources.extend([c['source_type'] for c in candidates])
                trace.append({'strategy': 'textures_meta_suffix', 'matched': suffix})
                return self._make_result(item_ref, candidates[:1], 0.85, 'textures_meta_suffix', trace)
        trace.append({'strategy': 'textures_meta_suffix', 'matched': None})
        return None

    def _grouped_files(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        variants = []
        for icon_key, values in self.asset_index.icons.items():
            if icon_key.startswith(f'{item_ref.base_key}') and icon_key != key:
                variants.extend(values)
                checked_keys.append(icon_key)
        checked_sources.extend([c['source_type'] for c in variants])
        trace.append({'strategy': 'grouped_files', 'variants': len(variants)})
        return self._make_result(item_ref, variants[:1], 0.75, 'grouped_files', trace)

    def _model_texture(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        model = self.asset_index.models.get(key)
        trace.append({'strategy': 'model_texture', 'model': bool(model)})
        if not model:
            return None
        layer0 = (model.get('textures') or {}).get('layer0')
        if not layer0:
            return None
        namespace, texture_name = layer0.split(':', 1)
        texture_key = f'{namespace}:{texture_name}'
        checked_keys.append(texture_key)
        candidates = self.asset_index.icons.get(texture_key, [])
        checked_sources.extend([c['source_type'] for c in candidates])
        return self._make_result(item_ref, candidates[:1], 0.8, 'model_texture', trace)

    def _block_texture(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        block_key = f'{item_ref.modid}:{item_ref.name}'
        checked_keys.append(block_key)
        candidates = [c for c in self.asset_index.icons.get(block_key, []) if '/blocks/' in c['path']]
        checked_sources.extend([c['source_type'] for c in candidates])
        trace.append({'strategy': 'block_texture', 'checked': len(candidates)})
        return self._make_result(item_ref, candidates[:1], 0.65, 'block_texture', trace)

    def _lang_lookup(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        locale = settings.get('locale', 'ru_ru')
        mapping = self.asset_index.lang.get(locale, {}) or self.asset_index.lang.get('en_us', {})
        lang_keys = [f'item.{item_ref.modid}.{item_ref.name}', f'tile.{item_ref.modid}.{item_ref.name}.name']
        checked_keys.extend(lang_keys)
        candidate = mapping.get(lang_keys[0]) or mapping.get(lang_keys[1])
        trace.append({'strategy': 'lang_lookup', 'locale': locale, 'found': bool(candidate)})
        if candidate:
            return ResolutionResult(item_raw=item_ref.raw, display_name=candidate, icon_asset_id=None, icon_url=None, animated=False, confidence=0.9, strategy='lang_lookup', trace=list(trace))
        return None

    def _manual_override(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        overrides = settings.get('manual_overrides', {})
        trace.append({'strategy': 'manual_override', 'found': item_ref.raw in overrides})
        if item_ref.raw not in overrides:
            return None
        override = overrides[item_ref.raw]
        return ResolutionResult(item_raw=item_ref.raw, display_name=override.get('display_name'), icon_asset_id=override.get('icon_asset_id'), icon_url=override.get('icon_url'), animated=False, confidence=0.99, strategy='manual_override', trace=list(trace))

    def _make_result(self, item_ref, candidates, confidence, strategy, trace):
        if not candidates:
            return None
        candidate = candidates[0]
        return ResolutionResult(item_raw=item_ref.raw, display_name=candidate.get('display_name') or item_ref.raw, icon_asset_id=candidate['asset_id'], icon_url=f"/api/icons/{candidate['asset_id']}", animated=candidate.get('animated', False), confidence=confidence, strategy=strategy, trace=list(trace))
