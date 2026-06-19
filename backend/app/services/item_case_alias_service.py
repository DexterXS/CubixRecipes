from __future__ import annotations

import csv
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional


ITEM_REF_RE = re.compile(r'<([A-Za-z0-9_.-]+):([A-Za-z0-9_./-]+)(?::([0-9*]+))?>')
ENTITY_TAG_RE = re.compile(r'\b(?:mobType|entityId|EntityId|EntityName|entityName)\s*:\s*"([^"]+)"')


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

    def load_report(self) -> Optional[dict[str, Any]]:
        if not self.report_path.is_file():
            return None
        try:
            return json.loads(self.report_path.read_text(encoding='utf-8'))
        except (OSError, json.JSONDecodeError):
            return None

    def build(self) -> dict[str, Any]:
        item_candidates, total_item_refs, scanned_files = self._collect_item_candidates()
        entity_candidates, total_entity_refs = self._collect_entity_candidates()
        itempanel_keys = self._read_itempanel_keys()

        item_aliases, item_conflicts = self._build_aliases(item_candidates)
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
            'scriptsDir': str(self.scripts_dir),
            'itempanelCsv': str(self.itempanel_csv),
            'scriptFiles': scanned_files,
            'scriptItemRefs': total_item_refs,
            'uniqueItemKeys': len(item_candidates),
            'mixedCaseItemAliases': sum(1 for candidate in item_candidates.values() if candidate.original != candidate.lower_key),
            'itempanelKeys': len(itempanel_keys),
            'matchedItemKeys': len(matched_items),
            'missingItemKeys': len(missing_items),
            'itemConflicts': len(item_conflicts),
            'scriptEntityRefs': total_entity_refs,
            'uniqueEntityKeys': len(entity_candidates),
            'entityConflicts': len(entity_conflicts),
        }
        report = {
            'ok': True,
            'generatedAt': generated_at,
            'aliasesPath': str(self.aliases_path),
            'reportPath': str(self.report_path),
            'summary': summary,
            'itemAliases': item_aliases,
            'entityAliases': entity_aliases,
            'matchedItems': matched_items,
            'missingItems': missing_items,
            'missingByMod': missing_by_mod,
            'itemConflicts': item_conflicts,
            'entityConflicts': entity_conflicts,
        }
        aliases = {
            'generatedAt': generated_at,
            'sourceScriptsDir': str(self.scripts_dir),
            'sourceItempanelCsv': str(self.itempanel_csv),
            'items': item_aliases,
            'entities': entity_aliases,
        }
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.aliases_path.write_text(json.dumps(aliases, ensure_ascii=False, indent=2), encoding='utf-8')
        self.report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        return report

    def _collect_item_candidates(self) -> tuple[dict[str, _AliasCandidate], int, int]:
        candidates: dict[str, _AliasCandidate] = {}
        total_refs = 0
        scanned_files = 0
        for path in self._iter_zs_files():
            scanned_files += 1
            text = self._read_text(path)
            for match in ITEM_REF_RE.finditer(text):
                total_refs += 1
                original = f'{match.group(1)}:{match.group(2)}'
                lower_key = original.lower()
                candidate = candidates.get(lower_key)
                if candidate is None:
                    candidate = _AliasCandidate(lower_key=lower_key, original=original, files=set(), metas=set())
                    candidates[lower_key] = candidate
                candidate.files.add(self._script_relative_path(path))
                candidate.metas.add(match.group(3) if match.group(3) else '0-or-none')
        return candidates, total_refs, scanned_files

    def _collect_entity_candidates(self) -> tuple[dict[str, _AliasCandidate], int]:
        candidates: dict[str, _AliasCandidate] = {}
        total_refs = 0
        for path in self._iter_zs_files():
            text = self._read_text(path)
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
                candidate.files.add(self._script_relative_path(path))
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
                with self.itempanel_csv.open('r', encoding=encoding, newline='') as handle:
                    return {
                        str(row.get('Item Name', '')).strip().lower()
                        for row in csv.DictReader(handle)
                        if str(row.get('Item Name', '')).strip()
                    }
            except UnicodeDecodeError:
                continue
        with self.itempanel_csv.open('r', encoding='utf-8', errors='replace', newline='') as handle:
            return {
                str(row.get('Item Name', '')).strip().lower()
                for row in csv.DictReader(handle)
                if str(row.get('Item Name', '')).strip()
            }

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
