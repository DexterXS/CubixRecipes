from __future__ import annotations

from urllib.parse import quote
from typing import Any, Optional

from app.domain.models import ItemRef, ResolutionResult
from app.indexer.asset_index import AssetIndex
from app.indexer.itempanel_icon_catalog import ItemPanelIconCatalog


class ItemResolver:
    def __init__(self, asset_index: AssetIndex, log_service: Optional[Any] = None, itempanel_icon_catalog: Optional[ItemPanelIconCatalog] = None):
        self.asset_index = asset_index
        self.log_service = log_service
        self.itempanel_icon_catalog = itempanel_icon_catalog
        self.last_resolution_details: dict[str, dict] = {}

    def resolve(self, item_ref: ItemRef, settings: Optional[dict] = None) -> ResolutionResult:
        trace: list[dict] = []
        settings = settings or {}
        key = item_ref.base_key
        checked_keys = [key]
        checked_sources: list[str] = list(dict.fromkeys(self.asset_index.last_scan_report.get('indexed_paths', [])))
        strategies = [
            self._manual_override,
            self._itempanel_icon_catalog,
            self._contenttweaker_exact,
            self._avaritia_meta_mapping,
            self._textures_exact,
            self._textures_meta_suffix,
            self._grouped_files,
            self._model_texture,
            self._block_texture,
            self._lang_lookup,
        ]
        for strategy in strategies:
            result = strategy(item_ref, key, settings, trace, checked_keys, checked_sources)
            if result is not None:
                self.last_resolution_details[item_ref.raw] = {
                    'source': self._extract_source_from_asset_id(result.icon_asset_id) if result.icon_asset_id else 'lang/manual',
                    'checked_sources': list(dict.fromkeys(checked_sources)),
                    'checked_keys': checked_keys,
                    'reason': f'matched via {result.strategy}',
                }
                if self.log_service is not None:
                    self.log_service.log('BACKEND', 'INFO', 'RESOLVER', 'Item resolved', {'raw_item_id': item_ref.raw, 'normalized_key': key, 'strategy': result.strategy, 'confidence': result.confidence, 'icon_asset_id': result.icon_asset_id, 'checked_keys': checked_keys, 'checked_sources': list(dict.fromkeys(checked_sources)), 'display_name': result.display_name}, verbose_only=True)
                return result
        result = ResolutionResult(item_raw=item_ref.raw, display_name=item_ref.raw, icon_asset_id=None, icon_url=None, animated=False, animation_meta=None, confidence=0.1, strategy='placeholder', trace=trace)
        self.last_resolution_details[item_ref.raw] = {
            'source': None,
            'checked_sources': list(dict.fromkeys(checked_sources)),
            'checked_keys': checked_keys,
            'reason': 'No icon, model or lang entry matched the item id',
        }
        if self.log_service is not None:
            self.log_service.log('BACKEND', 'WARN', 'RESOLVER', 'No icon found for item; placeholder may be used', {'raw_item_id': item_ref.raw, 'normalized_key': key, 'checked_keys': checked_keys, 'checked_sources': list(dict.fromkeys(checked_sources)), 'reason': 'No icon, model or lang entry matched the item id'})
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

    def _avaritia_meta_mapping(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        if item_ref.modid != 'avaritia' or item_ref.meta_value is None:
            trace.append({'strategy': 'avaritia_meta_mapping', 'skipped': 'not_applicable'})
            return None

        resource_types = [
            'diamond_lattice',
            'crystal_matrix_ingot',
            'neutron_pile',
            'neutron_nugget',
            'neutronium_ingot',
            'infinity_catalyst',
            'infinity_ingot',
            'record_fragment',
            'starfuel',
            'neutronium_gear',
        ]
        resource_block_types = ['neutronium', 'infinity']
        singularity_types = ['iron', 'gold', 'lapis', 'redstone', 'quartz', 'copper', 'tin', 'lead', 'silver', 'nickel', 'clay']

        candidate_keys: list[str] = []
        lang_keys: list[str] = []
        subtype: Optional[str] = None

        if item_ref.name == 'resource' and 0 <= item_ref.meta_value < len(resource_types):
            subtype = resource_types[item_ref.meta_value]
            candidate_keys = [
                f'{item_ref.modid}:resource_{subtype}',
                f'{item_ref.modid}:resource_{item_ref.meta_value}',
                f'{item_ref.modid}:{item_ref.name}_{item_ref.meta_value}',
            ]
            lang_keys = [f'item.resource_{subtype}.name', f'item.{item_ref.modid}.resource_{subtype}.name']
        elif item_ref.name == 'resource_block' and 0 <= item_ref.meta_value < len(resource_block_types):
            subtype = resource_block_types[item_ref.meta_value]
            candidate_keys = [
                f'{item_ref.modid}:block_{subtype}',
                f'{item_ref.modid}:{item_ref.name}_{item_ref.meta_value}',
                f'{item_ref.modid}:resource_block_{subtype}',
            ]
            lang_keys = [f'tile.block_{subtype}.name', f'tile.{item_ref.modid}.block_{subtype}.name']
        elif item_ref.name == 'singularity' and 0 <= item_ref.meta_value < len(singularity_types):
            subtype = singularity_types[item_ref.meta_value]
            candidate_keys = [
                f'{item_ref.modid}:singularity',
                f'{item_ref.modid}:singularity2',
                f'{item_ref.modid}:singularity_{subtype}',
            ]
            lang_keys = [f'item.singularity_{subtype}.name', f'item.{item_ref.modid}.singularity_{subtype}.name']

        if not candidate_keys:
            trace.append({'strategy': 'avaritia_meta_mapping', 'matched': None})
            return None

        checked_keys.extend(candidate_keys)
        if lang_keys:
            checked_keys.extend(lang_keys)

        for candidate_key in candidate_keys:
            candidates = self.asset_index.icons.get(candidate_key, [])
            if not candidates:
                continue
            checked_sources.extend([c['source_type'] for c in candidates])
            trace.append({'strategy': 'avaritia_meta_mapping', 'matched': candidate_key, 'subtype': subtype})
            result = self._make_result(item_ref, candidates[:1], 0.88, 'avaritia_meta_mapping', trace)
            if result is None:
                return None
            localized_name = self._lookup_lang_value(lang_keys, settings.get('locale', 'ru_ru'))
            if localized_name:
                result.display_name = localized_name
            return result

        trace.append({'strategy': 'avaritia_meta_mapping', 'matched': None, 'subtype': subtype})
        return None

    def _textures_meta_suffix(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        if item_ref.meta_value is None:
            trace.append({'strategy': 'textures_meta_suffix', 'checked': 0})
            return None
        suffixes = [
            f'{item_ref.base_key}_{item_ref.meta_value}',
            f'{item_ref.base_key}{item_ref.meta_value}',
            f'{item_ref.base_key}/{item_ref.meta_value}',
            f'{item_ref.base_key}.{item_ref.meta_value}',
            f'{item_ref.base_key}-{item_ref.meta_value}',
        ]
        checked_keys.extend(suffixes)
        for suffix in suffixes:
            candidates = self.asset_index.icons.get(suffix, [])
            if candidates:
                checked_sources.extend([c['source_type'] for c in candidates])
                trace.append({'strategy': 'textures_meta_suffix', 'matched': suffix})
                return self._make_result(item_ref, candidates[:1], 0.85, 'textures_meta_suffix', trace)
        ranked = self._meta_ranked_candidates(item_ref, checked_keys, checked_sources)
        if ranked:
            trace.append({'strategy': 'textures_meta_suffix', 'matched': ranked.get('matched_key'), 'ranking': ranked.get('score')})
            return self._make_result(item_ref, [ranked['candidate']], 0.82, 'textures_meta_suffix', trace)
        trace.append({'strategy': 'textures_meta_suffix', 'matched': None})
        return None

    def _grouped_files(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        if item_ref.meta_value is not None and not bool(settings.get('fallback_to_first_variant_for_meta_miss', False)):
            trace.append({'strategy': 'grouped_files', 'skipped': 'meta_present_and_fallback_disabled'})
            return None
        variants = []
        for icon_key, values in sorted(self.asset_index.icons.items(), key=lambda entry: entry[0]):
            if icon_key.startswith(f'{item_ref.base_key}') and icon_key != key:
                variants.extend(values)
                checked_keys.append(icon_key)
        checked_sources.extend([c['source_type'] for c in variants])
        trace.append({'strategy': 'grouped_files', 'variants': len(variants)})
        return self._make_result(item_ref, variants[:1], 0.75, 'grouped_files', trace)

    def _meta_ranked_candidates(self, item_ref, checked_keys, checked_sources):
        if item_ref.meta_value is None:
            return None
        meta_token = str(item_ref.meta_value)
        matches: list[dict[str, Any]] = []
        for icon_key, values in self.asset_index.icons.items():
            if not icon_key.startswith(f'{item_ref.modid}:'):
                continue
            tail = icon_key.split(':', 1)[1]
            if meta_token not in tail:
                continue
            score = 0
            if icon_key.startswith(f'{item_ref.base_key}'):
                score += 5
            if tail.endswith(f'/{meta_token}') or tail.endswith(f'_{meta_token}') or tail.endswith(f'.{meta_token}') or tail.endswith(f'-{meta_token}') or tail.endswith(meta_token):
                score += 4
            if item_ref.name in tail:
                score += 2
            if score <= 0:
                continue
            checked_keys.append(icon_key)
            checked_sources.extend([candidate['source_type'] for candidate in values])
            matches.append({'score': score, 'matched_key': icon_key, 'candidate': values[0]})
        if not matches:
            return None
        matches.sort(key=lambda item: (-item['score'], item['matched_key']))
        return matches[0]

    def _model_texture(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        model = self.asset_index.models.get(key)
        trace.append({'strategy': 'model_texture', 'model': bool(model)})
        if not model:
            return None
        layer0 = (model.get('textures') or {}).get('layer0')
        if not layer0:
            return None
        texture_key = self._normalize_texture_reference(item_ref, layer0)
        if not texture_key:
            trace.append({'strategy': 'model_texture', 'skipped': 'invalid_layer0_reference', 'layer0': layer0})
            if self.log_service is not None:
                self.log_service.log('BACKEND', 'WARN', 'RESOLVER', 'Skipped invalid model texture reference', {'raw_item_id': item_ref.raw, 'normalized_key': key, 'layer0': layer0})
            return None
        checked_keys.append(texture_key)
        candidates = self.asset_index.icons.get(texture_key, [])
        checked_sources.extend([c['source_type'] for c in candidates])
        return self._make_result(item_ref, candidates[:1], 0.8, 'model_texture', trace)

    def _normalize_texture_reference(self, item_ref: ItemRef, layer0: Any) -> Optional[str]:
        if not isinstance(layer0, str):
            return None
        normalized = layer0.strip()
        if not normalized or normalized.startswith('#'):
            return None
        if ':' in normalized:
            namespace, texture_name = normalized.split(':', 1)
            if namespace and texture_name:
                return f'{namespace}:{texture_name}'.lower()
            return None
        return f'{item_ref.modid}:{normalized}'.lower()

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
            return ResolutionResult(item_raw=item_ref.raw, display_name=candidate, icon_asset_id=None, icon_url=None, animated=False, animation_meta=None, confidence=0.9, strategy='lang_lookup', trace=list(trace))
        return None

    def _manual_override(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        overrides = settings.get('manual_overrides', {})
        trace.append({'strategy': 'manual_override', 'found': item_ref.raw in overrides})
        if item_ref.raw not in overrides:
            return None
        override = overrides[item_ref.raw]
        return ResolutionResult(item_raw=item_ref.raw, display_name=override.get('display_name'), icon_asset_id=override.get('icon_asset_id'), icon_url=override.get('icon_url'), animated=False, animation_meta=override.get('animation_meta'), confidence=0.99, strategy='manual_override', trace=list(trace))

    def _itempanel_icon_catalog(self, item_ref, key, settings, trace, checked_keys, checked_sources):
        if self.itempanel_icon_catalog is None:
            trace.append({'strategy': 'itempanel_icon_catalog', 'skipped': 'catalog_unavailable'})
            return None
        result = self.itempanel_icon_catalog.resolve(item_ref)
        if result is None:
            trace.append({'strategy': 'itempanel_icon_catalog', 'matched': None})
            return None
        trace.extend(result.trace)
        checked_sources.append(str(self.itempanel_icon_catalog.icons_dir))
        if result.icon_url is None:
            return None
        result.trace = list(trace)
        return result

    def _lookup_lang_value(self, lang_keys: list[str], locale: str) -> Optional[str]:
        if not lang_keys:
            return None
        mapping = self.asset_index.lang.get(locale, {}) or self.asset_index.lang.get('en_us', {})
        for key in lang_keys:
            value = mapping.get(key)
            if value:
                return value
        return None

    def _make_result(self, item_ref, candidates, confidence, strategy, trace):
        if not candidates:
            return None
        candidate = candidates[0]
        icon_asset_id = candidate['asset_id']
        icon_url = f"/api/icons/{quote(icon_asset_id, safe='')}"
        return ResolutionResult(item_raw=item_ref.raw, display_name=candidate.get('display_name') or item_ref.raw, icon_asset_id=icon_asset_id, icon_url=icon_url, animated=candidate.get('animated', False), animation_meta=candidate.get('animation_meta'), confidence=confidence, strategy=strategy, trace=list(trace))

    def _extract_source_from_asset_id(self, icon_asset_id: Optional[str]) -> Optional[str]:
        if not icon_asset_id:
            return None
        if '|' in icon_asset_id:
            return icon_asset_id.split('|', 1)[0]
        if ':' in icon_asset_id:
            return icon_asset_id.split(':', 1)[0]
        return icon_asset_id
