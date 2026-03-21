from __future__ import annotations

import json
from pathlib import Path
from zipfile import ZipFile


class AssetIndex:
    def __init__(self) -> None:
        self.icons: dict[str, list[dict]] = {}
        self.models: dict[str, dict] = {}
        self.lang: dict[str, dict[str, str]] = {}
        self.scan_status: dict[str, dict] = {}


    def reset(self) -> None:
        self.icons.clear()
        self.models.clear()
        self.lang.clear()
        self.scan_status.clear()

    def register_icon(self, key: str, candidate: dict) -> None:
        self.icons.setdefault(key, []).append(candidate)

    def register_model(self, key: str, payload: dict) -> None:
        self.models[key] = payload

    def register_lang(self, locale: str, mapping: dict[str, str]) -> None:
        self.lang.setdefault(locale, {}).update(mapping)

    def scan_paths(self, paths: list[str]) -> str:
        scan_id = f"scan-{len(self.scan_status)+1}"
        self.scan_status[scan_id] = {"progress": 0, "errors": [], "startedAt": "local"}
        for idx, raw_path in enumerate(paths, start=1):
            path = Path(raw_path)
            try:
                if path.is_dir():
                    self._scan_dir(path)
                elif path.suffix in {".jar", ".zip"}:
                    self._scan_zip(path)
            except Exception as exc:  # pragma: no cover - diagnostic path
                self.scan_status[scan_id]["errors"].append(str(exc))
            self.scan_status[scan_id]["progress"] = int(idx / max(len(paths), 1) * 100)
        return scan_id

    def _scan_dir(self, root: Path) -> None:
        for file_path in root.rglob("*"):
            if file_path.is_file():
                self._consume_file(file_path, file_path.relative_to(root).as_posix(), source=str(root))

    def _scan_zip(self, archive_path: Path) -> None:
        with ZipFile(archive_path) as archive:
            for name in archive.namelist():
                if name.endswith("/"):
                    continue
                self._consume_virtual(name, archive.read(name), source=str(archive_path))

    def _consume_file(self, file_path: Path, rel_path: str, source: str) -> None:
        data = file_path.read_bytes()
        self._consume_virtual(rel_path, data, source=source)

    def _consume_virtual(self, rel_path: str, data: bytes, source: str) -> None:
        if "/lang/" in rel_path and (rel_path.endswith(".json") or rel_path.endswith(".lang")):
            locale = Path(rel_path).stem
            self.register_lang(locale, self._parse_lang(rel_path, data))
        if "/models/item/" in rel_path and rel_path.endswith(".json"):
            namespace, item_name = self._extract_namespace_name(rel_path, "models/item", ".json")
            self.register_model(f"{namespace}:{item_name}", json.loads(data.decode("utf-8")))
        if rel_path.endswith(".png") and ("/textures/items/" in rel_path or "/textures/blocks/" in rel_path):
            namespace, item_name = self._extract_texture_key(rel_path)
            self.register_icon(f"{namespace}:{item_name}", {"asset_id": f"{source}:{rel_path}", "path": rel_path, "source_type": source, "animated": False})
        if rel_path.endswith(".png.mcmeta"):
            target = rel_path[:-7]
            namespace, item_name = self._extract_texture_key(target)
            self.register_icon(f"{namespace}:{item_name}", {"asset_id": f"{source}:{target}", "path": target, "source_type": source, "animated": True})

    def _extract_namespace_name(self, rel_path: str, folder: str, suffix: str) -> tuple[str, str]:
        namespace = rel_path.split("/")[1]
        name = rel_path.split(f"/{folder}/", 1)[1][:-len(suffix)]
        return namespace, name

    def _extract_texture_key(self, rel_path: str) -> tuple[str, str]:
        namespace = rel_path.split("/")[1]
        name = rel_path.split("/textures/", 1)[1].split("/", 1)[1][:-4]
        return namespace, name

    def _parse_lang(self, rel_path: str, data: bytes) -> dict[str, str]:
        text = data.decode("utf-8")
        if rel_path.endswith(".json"):
            return json.loads(text)
        result = {}
        for line in text.splitlines():
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            result[key.strip()] = value.strip()
        return result
