from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Optional


ITEM_REF_RE = re.compile(r'<([A-Za-z0-9_.-]+):([A-Za-z0-9_./-]+)(?::([0-9*]+))?>')
ITEM_KEY_RE = re.compile(r'<?([A-Za-z0-9_.-]+:[A-Za-z0-9_./-]+)(?::[0-9*]+)?>?')
FML_ID_MISMATCH_RE = re.compile(r'Fixed\s+(block|item)\s+id mismatch\s+([A-Za-z0-9_.-]+:[A-Za-z0-9_./-]+):\s+\d+\s+\(init\)\s+->\s+\d+\s+\(map\)', re.IGNORECASE)
ENTITY_TAG_RE = re.compile(r'\b(?:mobType|entityId|EntityId|EntityName|entityName)\s*:\s*"([^"]+)"')
ITEMPANEL_KEY_COLUMNS = ('Item Name', 'item name', 'key', 'item', 'item_key', 'itemKey')
FML_LOG_DEFAULT_NAME = 'fml-client-latest.log'


@dataclass
class _AliasCandidate:
    lower_key: str
    original: str
    files: set[str]
    metas: set[str]


class ItemCaseAliasService:
    def __init__(self, scripts_dir: Path, itempanel_csv: Path, output_dir: Path) -> None:
        self.scripts_dir = scripts_dir
        self.itempanel_csv = itempanel_csv
        self.output_dir = output_dir
        self.aliases_path = output_dir / 'item_case_aliases.json'
        self.report_path = output_dir / 'item_case_aliases_report.json'
        self.manual_aliases_path = output_dir / 'manual_item_case_aliases.json'
        self.fml_log_aliases_path = output_dir / 'fml_log_item_case_aliases.json'

    def load_report(self) -> Optional[dict[str, Any]]:
        if not self.report_path.is_file():
            return None
        try:
            return json.loads(self.report_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return None

    def build(self, sources: Optional[Iterable[tuple[str, str]]] = None, source_label: Optional[str] = None) -> dict[str, Any]:
        source_documents = list(sources) if sources is not None else self._load_path_sources()
        active_source_label = source_label or str(self.scripts_dir)
        item_candidates, total_item_refs = self._collect_item_candidates(source_documents)
        entity_candidates, total_entity_refs = self._collect_entity_candidates(source_documents)
        itempanel_keys = self._read_itempanel_keys()

        auto_item_aliases, item_conflicts = self._build_aliases(item_candidates)
        log_item_aliases = self.load_fml_log_item_aliases()
        fml_log_summary = self.load_fml_log_summary()
        manual_item_aliases = self.load_manual_item_aliases()
        item_aliases = {**auto_item_aliases, **log_item_aliases, **manual_item_aliases}
        entity_aliases, entity_conflicts = self._build_aliases(entity_candidates)
        matched_items: list[dict[str, Any]] = []
        missing_items: list[dict[str, Any]] = []

        for lower_key, candidate in sorted(item_candidates.items()):
            payload = self._candidate_payload(candidate)
            if lower_key in itempanel_keys:
                matched_items.append(payload)
            else:
                missing_items.append(payload)

        missing_by_mod_counter = Counter(self._modid_for(item['lower_key']) for item in missing_items)
        missing_by_mod = [
            {'modid': modid, 'count': count}
            for modid, count in sorted(missing_by_mod_counter.items(), key=lambda item: (-item[1], item[0]))
        ]

        generated_at = datetime.now(timezone.utc).isoformat()
        summary = {
            'generatedAt': generated_at,
            'scriptsDir': active_source_label,
            'sourceLabel': active_source_label,
            'itempanelCsv': str(self.itempanel_csv),
            'scriptFiles': len(source_documents),
            'scriptItemRefs': total_item_refs,
            'uniqueItemKeys': len(item_candidates),
            'mixedCaseItemAliases': sum(1 for candidate in item_candidates.values() if candidate.original != candidate.lower_key),
            'itempanelKeys': len(itempanel_keys),
            'matchedItemKeys': len(matched_items),
            'missingItemKeys': len(missing_items),
            'logItemAliases': len(log_item_aliases),
            'manualItemAliases': len(manual_item_aliases),
            'itemConflicts': len(item_conflicts),
            'scriptEntityRefs': total_entity_refs,
            'uniqueEntityKeys': len(entity_candidates),
            'entityConflicts': len(entity_conflicts),
        }
        report = {
            'ok': True,
            'generatedAt': generated_at,
            'sourceLabel': active_source_label,
            'aliasesPath': str(self.aliases_path),
            'reportPath': str(self.report_path),
            'manualAliasesPath': str(self.manual_aliases_path),
            'fmlLogAliasesPath': str(self.fml_log_aliases_path),
            'summary': summary,
            'itemAliases': item_aliases,
            'autoItemAliases': auto_item_aliases,
            'logItemAliases': log_item_aliases,
            'manualItemAliases': manual_item_aliases,
            'fmlLogSummary': fml_log_summary,
            'entityAliases': entity_aliases,
            'matchedItems': matched_items,
            'missingItems': missing_items,
            'missingByMod': missing_by_mod,
            'itemConflicts': item_conflicts,
            'entityConflicts': entity_conflicts,
        }
        aliases = {
            'generatedAt': generated_at,
            'sourceScriptsDir': active_source_label,
            'sourceItempanelCsv': str(self.itempanel_csv),
            'items': item_aliases,
            'autoItems': auto_item_aliases,
            'logItems': log_item_aliases,
            'manualItems': manual_item_aliases,
            'entities': entity_aliases,
        }
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.aliases_path.write_text(json.dumps(aliases, ensure_ascii=False, indent=2), encoding='utf-8')
        self.report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        return report

    def _collect_item_candidates(self, sources: list[tuple[str, str]]) -> tuple[dict[str, _AliasCandidate], int]:
        candidates: dict[str, _AliasCandidate] = {}
        total_refs = 0
        for source_name, text in sources:
            for match in ITEM_REF_RE.finditer(text):
                total_refs += 1
                original = f'{match.group(1)}:{match.group(2)}'
                lower_key = original.lower()
                candidate = candidates.get(lower_key)
                if candidate is None:
                    candidate = _AliasCandidate(lower_key=lower_key, original=original, files=set(), metas=set())
                    candidates[lower_key] = candidate
                candidate.files.add(source_name)
                candidate.metas.add(match.group(3) if match.group(3) else '0-or-none')
        return candidates, total_refs

    def _collect_entity_candidates(self, sources: list[tuple[str, str]]) -> tuple[dict[str, _AliasCandidate], int]:
        candidates: dict[str, _AliasCandidate] = {}
        total_refs = 0
        for source_name, text in sources:
            for match in ENTITY_TAG_RE.finditer(text):
                original = match.group(1).strip()
                if not original:
                    continue
                total_refs += 1
                lower_key = original.lower()
                candidate = candidates.get(lower_key)
                if candidate is None:
                    candidate = _AliasCandidate(lower_key=lower_key, original=original, files=set(), metas=set())
                    candidates[lower_key] = candidate
                candidate.files.add(source_name)
        return candidates, total_refs

    def _build_aliases(self, candidates: dict[str, _AliasCandidate]) -> tuple[dict[str, str], list[dict[str, Any]]]:
        originals_by_lower: dict[str, dict[str, set[str]]] = defaultdict(lambda: defaultdict(set))
        for candidate in candidates.values():
            originals_by_lower[candidate.lower_key][candidate.original].update(candidate.files)

        aliases: dict[str, str] = {}
        conflicts: list[dict[str, Any]] = []
        for lower_key, originals in sorted(originals_by_lower.items()):
            if len(originals) == 1:
                aliases[lower_key] = next(iter(originals))
                continue
            conflicts.append({
                'lowerKey': lower_key,
                'originals': [
                    {'original': original, 'files': sorted(files)}
                    for original, files in sorted(originals.items())
                ],
            })
        return aliases, conflicts

    def _candidate_payload(self, candidate: _AliasCandidate) -> dict[str, Any]:
        return {
            'lower_key': candidate.lower_key,
            'original': candidate.original,
            'modid': self._modid_for(candidate.lower_key),
            'metas': sorted(candidate.metas, key=self._meta_sort_key),
            'files': sorted(candidate.files),
        }

    def _read_itempanel_keys(self) -> set[str]:
        if not self.itempanel_csv.is_file():
            return set()
        for encoding in ('utf-8-sig', 'cp1251', 'windows-1251'):
            try:
                return self._read_itempanel_keys_with_encoding(encoding)
            except UnicodeDecodeError:
                continue
        return self._read_itempanel_keys_with_encoding('utf-8', errors='replace')

    def _read_itempanel_keys_with_encoding(self, encoding: str, errors: Optional[str] = None) -> set[str]:
        keys: set[str] = set()
        open_kwargs: dict[str, Any] = {'encoding': encoding, 'newline': ''}
        if errors is not None:
            open_kwargs['errors'] = errors
        with self.itempanel_csv.open('r', **open_kwargs) as handle:
            reader = csv.DictReader(handle)
            fieldnames = reader.fieldnames or []
            first_column = fieldnames[0] if fieldnames else None
            for row in reader:
                values = [str(row.get(column, '') or '') for column in ITEMPANEL_KEY_COLUMNS]
                if first_column:
                    values.append(str(row.get(first_column, '') or ''))
                for value in values:
                    normalized = self._normalize_item_key(value)
                    if normalized:
                        keys.add(normalized)
                        break
        return keys

    def load_manual_item_aliases(self) -> dict[str, str]:
        if not self.manual_aliases_path.is_file():
            return {}
        try:
            payload = json.loads(self.manual_aliases_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return {}
        raw_items = payload.get('items', payload) if isinstance(payload, dict) else {}
        if not isinstance(raw_items, dict):
            return {}
        aliases: dict[str, str] = {}
        for raw_key, raw_value in raw_items.items():
            lower_key = self._normalize_item_key(str(raw_key))
            original = self._extract_original_item_key(str(raw_value))
            if lower_key and original and original.lower() == lower_key:
                aliases[lower_key] = original
        return dict(sorted(aliases.items()))

    def save_manual_item_alias(self, lower_key: str, original: str) -> dict[str, str]:
        normalized_key = self._normalize_item_key(lower_key)
        original_key = self._extract_original_item_key(original)
        if not normalized_key:
            raise ValueError('Alias key must look like mod:item')
        if not original_key:
            raise ValueError('Alias value must look like Mod:Item')
        if original_key.lower() != normalized_key:
            raise ValueError('Alias key and value must refer to the same mod:item ignoring case')
        aliases = self.load_manual_item_aliases()
        aliases[normalized_key] = original_key
        self._write_manual_item_aliases(aliases)
        return aliases

    def _write_manual_item_aliases(self, aliases: dict[str, str]) -> None:
        self.output_dir.mkdir(parents=True, exist_ok=True)
        payload = {
            'updatedAt': datetime.now(timezone.utc).isoformat(),
            'items': dict(sorted(aliases.items())),
        }
        self.manual_aliases_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')

    def save_fml_log_aliases(self, filename: str, content: bytes) -> dict[str, Any]:
        text = self._decode_text_bytes(content)
        source_name = Path(filename or FML_LOG_DEFAULT_NAME).name or FML_LOG_DEFAULT_NAME
        candidates, total_matches, item_matches, block_matches = self._collect_fml_log_candidates(text, source_name)
        aliases, conflicts = self._build_aliases(candidates)
        updated_at = datetime.now(timezone.utc).isoformat()
        payload = {
            'updatedAt': updated_at,
            'sourceFilename': source_name,
            'totalMatches': total_matches,
            'itemMatches': item_matches,
            'blockMatches': block_matches,
            'aliases': len(aliases),
            'conflicts': conflicts,
            'items': aliases,
        }
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.fml_log_aliases_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
        return payload

    def load_fml_log_item_aliases(self) -> dict[str, str]:
        payload = self._load_fml_log_payload()
        raw_items = payload.get('items', {}) if isinstance(payload, dict) else {}
        if not isinstance(raw_items, dict):
            return {}
        aliases: dict[str, str] = {}
        for raw_key, raw_value in raw_items.items():
            lower_key = self._normalize_item_key(str(raw_key))
            original = self._extract_original_item_key(str(raw_value))
            if lower_key and original and original.lower() == lower_key:
                aliases[lower_key] = original
        return dict(sorted(aliases.items()))

    def load_fml_log_summary(self) -> Optional[dict[str, Any]]:
        payload = self._load_fml_log_payload()
        if not payload:
            return None
        return {
            'updatedAt': payload.get('updatedAt'),
            'sourceFilename': payload.get('sourceFilename'),
            'totalMatches': int(payload.get('totalMatches', 0) or 0),
            'itemMatches': int(payload.get('itemMatches', 0) or 0),
            'blockMatches': int(payload.get('blockMatches', 0) or 0),
            'aliases': len(self.load_fml_log_item_aliases()),
            'conflicts': payload.get('conflicts', []),
        }

    def _load_fml_log_payload(self) -> dict[str, Any]:
        if not self.fml_log_aliases_path.is_file():
            return {}
        try:
            payload = json.loads(self.fml_log_aliases_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return {}
        return payload if isinstance(payload, dict) else {}

    def _collect_fml_log_candidates(self, text: str, source_name: str) -> tuple[dict[str, _AliasCandidate], int, int, int]:
        candidates: dict[str, _AliasCandidate] = {}
        total_matches = 0
        item_matches = 0
        block_matches = 0
        for match in FML_ID_MISMATCH_RE.finditer(text):
            kind = match.group(1).lower()
            original = match.group(2)
            lower_key = original.lower()
            total_matches += 1
            if kind == 'item':
                item_matches += 1
            else:
                block_matches += 1
            candidate = candidates.get(lower_key)
            if candidate is None:
                candidate = _AliasCandidate(lower_key=lower_key, original=original, files=set(), metas=set())
                candidates[lower_key] = candidate
            candidate.files.add(f'{source_name}:{kind}')
            candidate.metas.add(kind)
        return candidates, total_matches, item_matches, block_matches

    def _decode_text_bytes(self, content: bytes) -> str:
        for encoding in ('utf-8-sig', 'utf-8', 'cp1251', 'windows-1251'):
            try:
                return content.decode(encoding)
            except UnicodeDecodeError:
                continue
        return content.decode('utf-8', errors='replace')

    def _normalize_item_key(self, value: str) -> Optional[str]:
        original = self._extract_original_item_key(value)
        return original.lower() if original else None

    def _extract_original_item_key(self, value: str) -> Optional[str]:
        match = ITEM_KEY_RE.search(value.strip())
        if not match:
            return None
        return match.group(1)

    def _load_path_sources(self) -> list[tuple[str, str]]:
        return [
            (self._script_relative_path(path), self._read_text(path))
            for path in self._iter_zs_files()
        ]

    def _iter_zs_files(self) -> list[Path]:
        if self.scripts_dir.is_file() and self.scripts_dir.suffix.lower() == '.zs':
            return [self.scripts_dir]
        if not self.scripts_dir.is_dir():
            return []
        return sorted(self.scripts_dir.rglob('*.zs'))

    def _read_text(self, path: Path) -> str:
        for encoding in ('utf-8-sig', 'utf-8', 'cp1251', 'windows-1251'):
            try:
                return path.read_text(encoding=encoding)
            except UnicodeDecodeError:
                continue
        return path.read_text(encoding='utf-8', errors='replace')

    def _script_relative_path(self, path: Path) -> str:
        try:
            return str(path.resolve(strict=False).relative_to(self.scripts_dir.resolve(strict=False)))
        except ValueError:
            return str(path)

    def _modid_for(self, lower_key: str) -> str:
        return lower_key.split(':', 1)[0] if ':' in lower_key else ''

    def _meta_sort_key(self, value: str) -> tuple[int, int | str]:
        if value == '0-or-none':
            return (0, 0)
        if value == '*':
            return (2, value)
        try:
            return (1, int(value))
        except ValueError:
            return (3, value)
