from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import quote
from zipfile import BadZipFile, ZipFile

from app.indexer.itempanel_icon_catalog import ItemPanelIconCatalog


MAX_ATLAS_SIZE = 4096
VALID_ARCHIVE_NAME = re.compile(r'^([a-z0-9_.-]+)_x(32|256)\.zip$')


class ArchiveAlreadyExistsError(ValueError):
    pass


class InvalidModIconArchiveError(ValueError):
    pass


@dataclass
class ModIconSource:
    key: str
    modid: str
    icon_name: str
    size: int
    archive_name: str
    entry_name: str
    content: bytes


class ModIconAtlasService:
    def __init__(self, archives_dir: Path, atlases_dir: Path) -> None:
        self.archives_dir = archives_dir
        self.atlases_dir = atlases_dir
        self._png_tools = ItemPanelIconCatalog(Path('__unused__.csv'), Path('__unused_icons__'))

    def status(self) -> dict[str, Any]:
        return {
            'archives': self.list_archives(),
            'manifest': self.read_manifest(),
            'rules': {
                'acceptedArchive': '.zip',
                'acceptedFiles': ['modid_x32.zip', 'modid_x256.zip', 'PNG files inside modid_x32/ or modid_x256/'],
                'maxAtlasSize': MAX_ATLAS_SIZE,
            },
        }

    def list_archives(self) -> list[dict[str, Any]]:
        if not self.archives_dir.is_dir():
            return []
        result: list[dict[str, Any]] = []
        for path in sorted(self.archives_dir.glob('*.zip'), key=lambda item: item.name.lower()):
            stat = path.stat()
            result.append({
                'name': path.name,
                'size': stat.st_size,
                'modifiedAt': datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
            })
        return result

    def upload_archive(self, raw_filename: str, content: bytes, replace: bool = False) -> dict[str, Any]:
        filename = self._safe_archive_name(raw_filename)
        if not content:
            raise InvalidModIconArchiveError('Archive is empty')
        self._validate_archive(filename, content)
        self.archives_dir.mkdir(parents=True, exist_ok=True)
        target = self.archives_dir / filename
        existed = target.exists()
        if existed and not replace:
            raise ArchiveAlreadyExistsError(f'Archive already exists: {filename}')
        target.write_bytes(content)
        return {
            'name': filename,
            'size': len(content),
            'replaced': replace and existed,
        }

    def generate_atlases(self) -> dict[str, Any]:
        self.atlases_dir.mkdir(parents=True, exist_ok=True)
        for old_atlas in self.atlases_dir.glob('mod-icons-x*.png'):
            old_atlas.unlink()

        sources = self._collect_sources()
        by_size: dict[int, dict[str, ModIconSource]] = {32: {}, 256: {}}
        duplicates: list[dict[str, str]] = []
        rejected: list[dict[str, str]] = []

        for source in sources:
            if source.key in by_size[source.size]:
                previous = by_size[source.size][source.key]
                duplicates.append({
                    'key': source.key,
                    'modid': source.modid,
                    'iconName': source.icon_name,
                    'size': f'x{source.size}',
                    'kept': f'{source.archive_name}:{source.entry_name}',
                    'replaced': f'{previous.archive_name}:{previous.entry_name}',
                })
            by_size[source.size][source.key] = source

        atlases: list[dict[str, Any]] = []
        entries: dict[str, dict[str, Any]] = {'x32': {}, 'x256': {}}
        for size, source_map in by_size.items():
            generated, size_entries, size_rejected = self._generate_size_atlases(size, list(source_map.values()))
            atlases.extend(generated)
            entries[f'x{size}'] = size_entries
            rejected.extend(size_rejected)

        manifest = {
            'updatedAt': datetime.now(timezone.utc).isoformat(),
            'maxAtlasSize': MAX_ATLAS_SIZE,
            'fallbackAtlasUrl': '/api/itempanel/atlas.png',
            'archives': self.list_archives(),
            'atlases': atlases,
            'entries': entries,
            'duplicates': duplicates,
            'rejected': rejected,
            'totalMods': len({source.modid for source in sources}),
            'totalIcons': len({source.key for source in sources}),
        }
        (self.atlases_dir / 'mod-icons-atlas.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
        return manifest

    def read_manifest(self) -> dict[str, Any] | None:
        path = self.atlases_dir / 'mod-icons-atlas.json'
        if not path.is_file():
            return None
        try:
            return json.loads(path.read_text(encoding='utf-8'))
        except json.JSONDecodeError:
            return None

    def read_atlas_png(self, filename: str) -> bytes | None:
        safe_name = Path(filename).name
        if safe_name != filename or not safe_name.startswith('mod-icons-') or not safe_name.endswith('.png'):
            return None
        path = (self.atlases_dir / safe_name).resolve(strict=False)
        try:
            path.relative_to(self.atlases_dir.resolve(strict=False))
        except ValueError:
            return None
        if not path.is_file():
            return None
        return path.read_bytes()

    def _safe_archive_name(self, raw_filename: str) -> str:
        filename = Path((raw_filename or '').strip()).name
        if not filename or filename != raw_filename.strip() or not filename.lower().endswith('.zip'):
            raise InvalidModIconArchiveError('Only .zip archive files are accepted')
        if not VALID_ARCHIVE_NAME.match(filename):
            raise InvalidModIconArchiveError('Archive name must match modid_x32.zip or modid_x256.zip')
        return filename

    def _parse_archive_name(self, archive_name: str) -> tuple[str, int, str]:
        match = VALID_ARCHIVE_NAME.match(Path(archive_name).name)
        if not match:
            raise InvalidModIconArchiveError('Archive name must match modid_x32.zip or modid_x256.zip')
        return match.group(1), int(match.group(2)), f'{match.group(1)}_x{match.group(2)}'

    def _validate_archive(self, filename: str, content: bytes) -> None:
        _modid, _size, expected_root = self._parse_archive_name(filename)
        try:
            with ZipFile(BytesIO(content)) as archive:
                entries = [entry for entry in archive.infolist() if not entry.is_dir()]
                if not entries:
                    raise InvalidModIconArchiveError('Archive does not contain icon files')
                invalid: list[str] = []
                for entry in entries:
                    if not self._entry_is_supported_icon_path(entry.filename, expected_root):
                        invalid.append(entry.filename)
                if invalid:
                    sample = ', '.join(invalid[:5])
                    raise InvalidModIconArchiveError(
                        f'Archive contains unsupported files: {sample}. Only .png files at root or under {expected_root}/ are accepted.'
                    )
                bad_file = archive.testzip()
                if bad_file:
                    raise InvalidModIconArchiveError(f'Archive has a corrupted entry: {bad_file}')
        except BadZipFile as exc:
            raise InvalidModIconArchiveError('Uploaded file is not a valid .zip archive') from exc

    def _collect_sources(self) -> list[ModIconSource]:
        result: list[ModIconSource] = []
        for archive_path in sorted(self.archives_dir.glob('*.zip'), key=lambda item: item.name.lower()):
            try:
                modid, size, expected_root = self._parse_archive_name(archive_path.name)
            except InvalidModIconArchiveError:
                continue
            with ZipFile(archive_path) as archive:
                for entry in archive.infolist():
                    if entry.is_dir():
                        continue
                    if not self._entry_is_supported_icon_path(entry.filename, expected_root):
                        continue
                    icon_name = self._icon_name_from_entry(entry.filename, expected_root)
                    key = f'{modid}/{icon_name}'
                    result.append(ModIconSource(
                        key=key,
                        modid=modid,
                        icon_name=icon_name,
                        size=size,
                        archive_name=archive_path.name,
                        entry_name=entry.filename,
                        content=archive.read(entry),
                    ))
        return result

    def _generate_size_atlases(self, size: int, sources: list[ModIconSource]) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, str]]]:
        if not sources:
            return [], {}, []
        tile_size = size
        max_columns = MAX_ATLAS_SIZE // tile_size
        capacity = max_columns * max_columns
        atlases: list[dict[str, Any]] = []
        manifest_entries: dict[str, Any] = {}
        rejected: list[dict[str, str]] = []
        by_mod: dict[str, list[ModIconSource]] = {}
        for source in sources:
            by_mod.setdefault(source.modid, []).append(source)

        for modid in sorted(by_mod):
            ordered_sources = sorted(by_mod[modid], key=lambda item: item.icon_name.lower())
            for page_index, start in enumerate(range(0, len(ordered_sources), capacity), start=1):
                page_sources = ordered_sources[start:start + capacity]
                columns = min(max_columns, max(1, math.ceil(math.sqrt(len(page_sources)))))
                rows = max(1, math.ceil(len(page_sources) / columns))
                atlas_width = columns * tile_size
                atlas_height = rows * tile_size
                atlas = bytearray(atlas_width * atlas_height * 4)
                atlas_filename = f'mod-icons-{modid}-x{size}-{page_index}.png'
                atlas_entries: dict[str, Any] = {}

                for index, source in enumerate(page_sources):
                    x = (index % columns) * tile_size
                    y = (index // columns) * tile_size
                    try:
                        icon_width, icon_height, icon_rows = self._png_tools.read_png_rgba_bytes(source.content)
                        if icon_width > tile_size or icon_height > tile_size:
                            icon_width, icon_height, icon_rows = self._png_tools._resize_nearest_rgba(icon_width, icon_height, icon_rows, tile_size)
                        offset_x = x + (tile_size - icon_width) // 2
                        offset_y = y + (tile_size - icon_height) // 2
                        self._png_tools._blit_rgba(atlas, atlas_width, icon_rows, icon_width, icon_height, offset_x, offset_y)
                    except Exception as exc:
                        rejected.append({
                            'key': source.key,
                            'modid': source.modid,
                            'iconName': source.icon_name,
                            'size': f'x{size}',
                            'archive': source.archive_name,
                            'entry': source.entry_name,
                            'reason': f'{exc.__class__.__name__}: {exc}',
                        })
                        continue

                    entry = {
                        'key': source.key,
                        'modid': source.modid,
                        'iconName': source.icon_name,
                        'entryName': source.entry_name,
                        'size': size,
                        'page': page_index,
                        'atlasFile': atlas_filename,
                        'image_url': f"/api/admin/mod-icons/atlases/{quote(atlas_filename)}",
                        'x': x,
                        'y': y,
                        'w': tile_size,
                        'h': tile_size,
                    }
                    atlas_entries[source.key] = entry
                    manifest_entries[source.key] = entry

                if atlas_entries:
                    (self.atlases_dir / atlas_filename).write_bytes(self._png_tools._encode_rgba_png(atlas_width, atlas_height, atlas))
                    atlases.append({
                        'modid': modid,
                        'size': size,
                        'page': page_index,
                        'image_url': f"/api/admin/mod-icons/atlases/{quote(atlas_filename)}",
                        'file': atlas_filename,
                        'columns': columns,
                        'rows': rows,
                        'tileSize': tile_size,
                        'entries': atlas_entries,
                    })

        return atlases, manifest_entries, rejected

    def _entry_is_supported_icon_path(self, raw_entry_name: str, expected_root: str | None) -> bool:
        entry_name = raw_entry_name.replace('\\', '/')
        path = PurePosixPath(entry_name)
        if path.is_absolute() or '..' in path.parts or not path.name:
            return False
        if path.suffix.lower() != '.png':
            return False
        if expected_root and len(path.parts) > 1 and path.parts[0] != expected_root:
            return False
        return True

    def _icon_name_from_entry(self, raw_entry_name: str, expected_root: str) -> str:
        path = PurePosixPath(raw_entry_name.replace('\\', '/'))
        parts = list(path.parts)
        if parts and parts[0] == expected_root:
            parts = parts[1:]
        if not parts:
            return path.stem
        parts[-1] = PurePosixPath(parts[-1]).stem
        return '/'.join(parts)
