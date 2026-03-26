# Changelog

## [Unreleased]
### Fixed
- Hardened backend write-path handling for `/api/recipes/save-as` and `/api/zs/files/create`: writes are now restricted to configured recipe roots and out-of-scope paths return HTTP 400.
- Added backend input bounds for recipe grid/matrix payloads to prevent oversized allocations and invalid matrix dimensions.
- Normalized API error semantics: `PUT /api/recipes/{recipe_uid}` now returns HTTP 404 for unknown recipe ids; `GET /api/index/status/{scan_id}` now returns HTTP 404 for unknown scan ids.
- Resolver manual overrides are now applied before automatic lookup strategies, so explicit user overrides always win.
- Reduced asset-scan report memory pressure by capping stored skipped-file samples while still tracking total skipped count.
- Project settings validation now explicitly marks `recipe_db_path` as stored-but-unused in current backend runtime.
- Улучшен парсинг `itempanel.csv` во frontend: теперь учитываются `meta`, сохраняются `id`/`has_nbt` как структурные поля для будущих задач, при отсутствии meta в item raw используется дефолт `0`, а fallback на «первую попавшуюся meta» добавлен как отключаемая настройка (`VITE_ITEMPANEL_FALLBACK_TO_FIRST_META=false` по умолчанию).
- Улучшены эвристики resolver для meta-текстур: добавлены дополнительные meta-суффиксы (`_`, `/`, `.`, `-`), ранжирование кандидатов по meta и имени предмета, а рискованный fallback на grouped variants для meta-miss теперь отключён по умолчанию и включается только через `settings.fallback_to_first_variant_for_meta_miss`.
- Добавлены параметризованные тесты по `mods_json/*.json` для каждого мода с текстурами, чтобы проверять индексацию манифестов модов на реальных деревьях файлов.
- Recipe grid now renders resolved item icons directly in cells, shows Russian hover names sourced from `itempanel.csv` (by `item key + meta` fallback), and allows opening craft-edit modal from grid/output icons.
- Added a dedicated craft-edit modal with `Очистить / Скопировать / Вставить / Применить` actions that operate on parsed CraftTweaker `addShaped(...)` source format for quick round-trip editing.
- Fixed recipe/item key normalization across parser/index/resolver so mixed-case ids like `<Avaritia:Resource_Block:1>` resolve against lowercase indexed textures.
- Grid icon click editor now opens per-item editing context (output or a specific cell) instead of a shared full-recipe text modal.
- Synced frontend `itempanel.csv` with the latest root dataset and improved RU title lookup: ignore empty/placeholder names, support wildcard-meta fallback (`*` → prefer meta `1`/`0`/any known), and apply localized name to output title too.
- Fixed grid tooltip title priority: now itempanel-based Russian names are preferred over resolver raw placeholders.
- Tooltip localization now resolves strictly by itempanel column 1 key and displays only column 5 `display_name`; wildcard meta inputs (`:*`) append `*` back to the translated text.
- Updated `start-dev.py` control panel visuals to a black theme (dark background, muted hints, dark action buttons) for less eye strain.
- Cleaned up frontend/backend address handling: API calls and debug logging now use a shared runtime config, the inline offline hint explains both `/api` and the current dev-proxy target, and Vite proxy target/port are configured from env instead of scattered hardcoded strings.
- Fixed startup race between backend and frontend: the control panel now waits for backend health-check readiness before launching frontend, status labels reflect API readiness more accurately, the panel backend now starts in stable no-reload mode by default, and the SPA retries loading UI settings after temporary backend unavailability.
- Rebuilt `start-dev.py` logging so the control panel now uses a dedicated action log, bounded in-memory buffers for console/action output, separate stdout/stderr readers, stderr highlighting, and unbuffered child-process env defaults for more reliable live logs.
- Backend parser now normalizes clipboard text that contains literal escaped whitespace sequences like `\n`/`\t`, so pasted `mods.avaritia.ExtremeCrafting.addShaped(...)` recipes parse correctly.
- Frontend input panel now auto-parses pasted or manually inserted `addShaped(...)` text instead of only updating the textarea, and the main toolbar action is labeled `Парсить` to better match its behavior.
- Frontend now shows an inline warning in the input panel when `/api/parse` cannot reach the backend, so connection-refused failures are visible even if the status panel is hidden.
- Backend resolver now skips malformed `models/item` texture references instead of crashing `/api/parse` with HTTP 500 when a mod asset uses `#layer0` or another invalid `layer0` value.
- Frontend now suppresses repeated `/api/debug/log` retries and skips background UI-preference autosaves while the backend is offline, so connection-refused states no longer masquerade as unrelated save errors.
- Replaced placeholder icon proxy with real binary streaming: `/api/icons/{icon_asset_id}` now reads PNG data from indexed files/jar entries and returns actual images.
- Resolver/source parsing now correctly handles asset ids for Windows-like paths via a robust `source|relative_path` format while preserving backward compatibility.
- Fixed icon URLs for Windows/jar-based sources by URL-encoding `icon_asset_id` in resolver responses and decoding it in icon proxy routes, so textures with `:\` and separators now load correctly in browser requests.
- Fixed noisy asset scan parse errors by only parsing `.png.mcmeta` animation metadata for texture paths under `/textures/items/` and `/textures/blocks/`.

### Added
- Added zoned frontend docking layout with separate top-left, top-right, bottom, and sidebar drop targets, per-zone drag reorder, visible drop-zone highlighting, panel resize, and persisted native resizers for the main/sidebar split, top-left/top-right split, and top/bottom section heights.
- Added a utility-bar settings button with an explicit “save current window layout” action that writes the current panel arrangement and zone sizes back to the backend config for reuse on the next app start.
- Added structured backend debug diagnostics endpoints/state for config, recipe scans, asset scans, resolver traces, parse history, missing links, summary counters, and a ring-buffer unified log API that collects backend/frontend/API/UI events.
- Added a new Control Panel `Full Debug Log` tab with source/level filters, copy/save/clear controls, auto-scroll, `Test Debug Pipeline`, and explicit request diagnostics for the unified log URL/status/error body.
- Fixed backend asset indexing so `mods_dir` directories now scan nested `.jar`/`.zip` files, boot logs show raw/normalized config and final index paths, and resolver diagnostics include non-empty checked sources from real asset paths.
- Added project path configuration storage in `cubixrecipes.config.json`, backend settings endpoints, and a new Control Panel `Settings` tab with browse actions and path validation.
- Added recipe output rendering/editing in the React UI, including output resolution metadata in API responses for future icon/name display.
- Added `mods_json` manifest indexing support: backend now reads JSON tree snapshots of mods/jars, registers texture candidates from those trees, and marks animated textures when paired `.png.mcmeta` entries exist.
- Added animated output icon rendering in frontend using sprite-sheet playback for resources marked as animated.

### Changed
- Backend now reloads storage/index inputs from the shared project config and serializes output/item resolution data together with parsed recipes.

### Fixed
- Added Vite `/api` proxy and wired frontend toolbar actions so parse/save/create/help/wiki controls now execute real flows instead of inert buttons.
- Added frontend parse/save error handling so the UI leaves the `Парсинг...` state on backend failures and shows actionable status messages.
- Expanded backend `save-as` API to accept generated/frontend-edited recipes and return the newly saved recipe for immediate UI refresh.

### Added
- Initial CubixRecipes project bootstrap with FastAPI backend, React+Vite frontend, docs, skills, and MVP recipe/parser/storage/resolver flow.
- Added a root `start-dev.py` control panel with Start/Stop/Restart actions for backend and frontend; on Windows it launches the dev servers in separate consoles.


### Changed
- Replaced placeholder repository files with a structured modular architecture for backend and frontend development.
- Expanded `start-dev.py` with an in-window action log that explains launches, stops, restart reasons, and which managed processes can currently be stopped.
- Reworked `start-dev.py` into a tabbed control panel with embedded backend/frontend consoles and a dedicated action log, streaming each process output directly into the app instead of opening separate windows.
- Sanitized embedded console output in `start-dev.py` so ANSI color/control sequences from tools like Vite are stripped before rendering in Tkinter.
- Added copyable/selectable console text, clickable HTTP/HTTPS links, UTF-8 subprocess decoding, and extra mojibake cleanup for embedded console tabs.
- Replaced backend `|` union type hints with Python 3.9-compatible typing constructs (`Optional`/`Union`) so FastAPI/Pydantic imports no longer fail in older runtime environments.
- Removed backend `dataclass(slots=True)` usage so Python 3.9 runtimes no longer fail during module import with `TypeError: dataclass() got an unexpected keyword argument 'slots'`.
- Improved `start-dev.py` backend startup validation so it checks which Python interpreter actually has `uvicorn` installed and shows an actionable install command when the environment is incomplete.

### Fixed
- Cleaned project instructions so AGENTS.md now contains only permanent workflow and maintenance rules.
- Rebuilt the frontend into a multi-panel recipe editor with a sticky action toolbar, status bar, collapsible cards, responsive three-column workspace, stronger output presentation, adaptive scrollable grid, quick diagnostics/info sidebar, and config-backed UI preferences for display/density/editor modes.
- Optimized debug/control-panel flow by moving Tkinter backend requests off the main thread, adding incremental unified log fetching with cursor-based updates, deduplicating repeated log spam, and simplifying wiki opening so docs no longer depend on the heavy debug pipeline.
- Reworked the frontend into a modular RU-first workspace with configurable panel layout, panel visibility controls via a `View` menu, panel move/reorder actions, persisted language/layout preferences, and a default input-left/output-right composition.


- Fixed Full Debug Log timeouts by adding a lightweight query path with diagnostics, a dedicated UI-preferences endpoint that avoids full rescans, and control-panel request timing/bottleneck reporting.
- Replaced button-first panel movement with drag-and-drop, persisted panel heights/workspace splitters, and mouse-driven resize handles in the React workspace.
- Fixed workspace panel label translations for the new `hero`/`toolbar`/`statusBar` panels and prevented late settings loads from overwriting user layout changes made immediately after startup.
