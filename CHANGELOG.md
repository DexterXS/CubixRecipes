# Changelog

## [Unreleased]
### Fixed
- Hid the recipe-grid internal raw inputs in view mode so read-only/default users no longer see dark dots over craft slots while editing remains blocked.
- Indexed uploaded `.zs` draft recipe outputs in the frontend so `R` can open already-loaded local draft recipes without waiting for empty backend lookups, and added hotkey debug timings for recipe searches and draft parsing.
- Added local uploaded `.zs` draft fallback for `U` uses lookup, so the paged uses window can show recipes from already-loaded drafts even when backend `/recipes/uses` returns no matches.
- Made backend matrix parsing tolerate CraftTweaker wrapper calls around item references, fixing local draft recipe opens that failed with `malformed node or string` during `R` lookup.
- Moved the on-page R/U hotkey debug panel behind an admin-only Settings toggle and disabled it by default.
- Made `R` fall back to matching locally uploaded `.zs` drafts when backend recipe search returns no matches, and log that fallback in the on-page hotkey debug panel.
- Added an on-page R/U hotkey debug panel and made recipe/uses hotkeys read physical `KeyR`/`KeyU`, so they work across English and Russian keyboard layouts while exposing hover, focus, DOM raw, and API lookup steps.
- Added per-user local draft persistence keyed by a hashed Google email, so the current craft, editor input, NEI search, recipe history, uploaded draft metadata, and temporary craft/NBT editor fields survive page reloads on the same PC.
- Made recipe hotkeys item-aware outside NEI: `R` now opens recipes from hovered NEI, craft-grid, and output items, `U` opens a paged "used in recipes" modal, and recipe navigation now has back/forward arrows.
- Repaired mojibake Russian UI strings in the React app, raised modal layering above grid hover targets, added NEI recipe-availability highlighting with a backend batch lookup, and added PostgreSQL-backed custom item overrides with per-user/global scope plus NBT editing.
- Simplified the frontend shell into a static `Главное меню` / `Черновики` / admin-only `Отладка` flow, moved scale and staff-role controls into Settings, removed the View/items customization controls, and added recipe file draft import/download actions.
- Prevented Railway Google sign-in from saving the session on a different backend host than the one used by `VITE_API_BASE`; OAuth callbacks now follow the actual `/auth/google/start` request host unless `GOOGLE_REDIRECT_URI` is explicitly set.
- Made Google OAuth `state` self-contained and signed so Railway callbacks can complete even when the temporary state cookie is not returned by the browser.
- Replaced Authlib's session-backed OAuth state handling with an explicit signed HttpOnly state cookie to avoid Google callback `mismatching_state` failures on Railway.
- Added `httpx` to backend runtime dependencies because Authlib's Starlette OAuth client imports it outside the dev/test dependency set.
- Added a root `requirements.txt` that delegates to `backend/requirements.txt` so Railway/Railpack installs backend auth dependencies even when the service root is the repository root.
- Added Railway Postgres fallbacks for `DATABASE_PUBLIC_URL` and `PGHOST`/`PGPORT`/`PGUSER`/`PGPASSWORD`/`PGDATABASE` when `DATABASE_URL` is not injected into the backend service.
- Improved Railway auth configuration detection: backend now accepts common Postgres URL aliases and lets CORS preflight requests pass before auth checks.
- Fixed cross-domain Railway auth sessions by using `SameSite=None; Secure` cookies when `FRONTEND_PUBLIC_URL` and `APP_PUBLIC_URL` point to different hosts.
- Fixed separate Railway frontend/backend deployments by allowing absolute `VITE_API_BASE` values and enabling credentialed CORS from `FRONTEND_PUBLIC_URL`.
- Added mandatory Google account authentication backed by PostgreSQL users, with `admin`/`moderator`/`default` roles and immutable root-admin protection for `root.user76@gmail.com`.
- Added `backend/requirements.txt` for Railpack-style backend deploys so `fastapi`, `pydantic`, and `uvicorn` are installed before the container runs `uvicorn`.
- Fixed recipe builder slot atlas previews after NEI insertion: craft-grid atlas sprites now keep a real `32x32` source box, scale visually instead of collapsing to zero height, and hover/drop layers cover the whole slot.
- Fixed wildcard-meta item previews in recipe cells and output slots so raws like `<mod:item:*>` use the first matching itempanel atlas sprite instead of showing a `?`.
- Restored the main PySide `admin_panel.py` / `CubixRecipes_Admin.exe` control panel and added a `Rebuild Atlas` action with progress/status there.
- Added NEI painting controls for the recipe grid: clicking outside cells drops the held cursor item, left-dragging with a held item fills crossed cells, and right-dragging with an empty cursor clears crossed cells.
- Added NEI recipe lookup with the `R` key: hovering an item opens the matching recipe from the local `Recipes` folder, and the normal save action writes it back through the same loaded recipe source.
- Hardened the PySide admin panel port handling: backend startup now uses a real bind-test for `127.0.0.1:8000`, distinguishes `API: OCCUPIED` from panel-owned `API: ONLINE`, resolves the project root correctly from onedir builds, and only reports port cleanup success after the port is actually reusable.
- Stopped the admin panel from polling `/health` forever; API checks now run only as a short backend readiness probe and stop after the first `200 OK` or a startup timeout, avoiding continuous `TIME_WAIT` growth.
- Reworked the recipe craft grid into a Minecraft-style grey slot board, limited recipe builder sizes to `3x3` and `9x9`, and wired grid/output cells to render itempanel atlas icons directly.
- Added a generated static itempanel atlas fallback in `frontend/public`, removed the atlas builder's Pillow dependency, fixed NEI wheel paging to use a non-passive listener, and deduplicated itempanel entries to stop React duplicate-key warnings.
- Fixed the PySide admin panel controls: start/stop buttons now follow `QProcess` state, stop requests terminate child process trees, backend reload is opt-in, and panel restart uses a detached launch to avoid PyInstaller `_MEI` runtime errors.
- Added lazy itempanel icon atlas generation (`/api/itempanel/atlas` + `/api/itempanel/atlas.png`) and switched the NEI item panel to render atlas slices instead of issuing one image request per visible item.
- Added NEI-style paging to the right item panel: dense icon pages now show a page counter, next/previous controls, and mouse-wheel page switching while keeping search scoped and resetting to page 1 on new queries.
- Reworked the frontend workspace around top-level tabs (`Редактор`, `Рецепт`, `Предметы`, `Отладка`), moved texture-cache controls into the `Предметы` tab, reduced header button clutter, and added a persisted dark/light theme toggle.
- Simplified the editor tools panel to only save actions (`Сохранить`, `Сохранить как`); parsing now relies on the existing automatic parse flow for pasted/edited recipes.
- Rebuilt the frontend workspace into a fixed three-column layout and removed dynamic panel drag/drop, drop targets, and resize handles while keeping panel visibility controls and modal workflows.
- Added `itempanel_icons`/NEI dump support as the primary icon source: backend now resolves item icons through `itempanel.csv` display names first, filters broken dump icons, and skips the heavy asset scan during startup when the catalog is available.
- Optimized backend asset indexing by skipping irrelevant files before reading bytes and registering texture PNGs from their paths/locators without loading binary content during scans.
- Optimized recipe saves so `save_existing` and `save_as` rescan only the changed `.zs` file instead of all configured recipe sources.
- Resolver now applies Avaritia-specific meta mapping for `Resource`, `Resource_Block`, and `Singularity`: meta is mapped to internal subtype texture keys (including shared `singularity` textures) and localized singularity names are taken from lang keys like `item.singularity_<type>.name`.
- Fixed animated sprite previews when UI animation is disabled: animated textures now render their first frame as a static preview instead of disappearing.
- Fixed grid icon refresh after inline cell edits: clearing a cell now removes stale icons immediately, and pasting a known item raw restores its icon preview without requiring a full re-parse.
- Craft editor now includes item autocomplete search from a single CSV source with support for `ID`, `ID:meta`, `mod:item`, `mod:item:meta`, RU names, and EN names; selected suggestions are inserted without empty `.withTag(...)` suffixes.
- Added a first-stage structured NBT editor in the craft modal (fixed `mod/item/meta` fields + add/remove NBT key/value rows) with raw builder logic that only appends `.withTag(...)` when NBT fields are non-empty.
- Replaced stage-1 NBT key/value rows with a collapsible tree editor that supports nested `compound`/`list` nodes and per-value type dropdowns (`byte`/`short`/`int`/`long`/`float`/`double`/`string`/arrays) for cleaner `.withTag(...)` construction.
- Craft/help/layout modals now support local zoom via a gear control (`0.8x`–`1.5x`) and manual resize, reducing overlap in dense editors; craft-modal utility actions were switched to icon buttons for clearer compact controls.
- Structured NBT tree editor moved into its own dedicated modal window (with separate zoom control) and NBT row layout was widened/reflowed to prevent value/type overlap in dense nested trees.
- Item-search suggestions no longer duplicate Russian name in the second line when `display_en` is missing in `itempanel.csv` (second line is now hidden unless distinct EN text exists).
- Craft item-search suggestions now show mini static item icons (non-animated) using a cached `/api/items/resolve` lookup per suggestion.
- Frontend now persists item-search caches in browser `localStorage` (`itempanel` entries + resolved suggestion icons), so refreshes reuse cached data and reduce slow reload-time icon lookups.
- Backend parser now accepts item references with optional `.withTag(...)` suffix in item-query and matrix parsing flows, so frontend structured editor output works end-to-end with save/parse routes.
- Fixed `invalid syntax` failures when parsing `addShaped` matrices that contain `<item>.withTag({...})` cells (including 9x9 Avaritia recipes).
- Hardened backend write-path handling for `/api/recipes/save-as` and `/api/zs/files/create`: writes are now restricted to configured recipe roots and out-of-scope paths return HTTP 400.
- Added backend input bounds for recipe grid/matrix payloads to prevent oversized allocations and invalid matrix dimensions.
- Normalized API error semantics: `PUT /api/recipes/{recipe_uid}` now returns HTTP 404 for unknown recipe ids; `GET /api/index/status/{scan_id}` now returns HTTP 404 for unknown scan ids.
- Resolver manual overrides are now applied before automatic lookup strategies, so explicit user overrides always win.
- Reduced asset-scan report memory pressure by capping stored skipped-file samples while still tracking total skipped count.
- Project settings validation now explicitly marks `recipe_db_path` as stored-but-unused in current backend runtime.
- Улучшен парсинг `itempanel.csv` во frontend: теперь учитываются `meta`, сохраняются `id`/`has_nbt` как структурные поля для будущих задач, при отсутствии meta в item raw используется дефолт `0`, а fallback на «первую попавшуюся meta» добавлен как отключаемая настройка (`VITE_ITEMPANEL_FALLBACK_TO_FIRST_META=false` по умолчанию).
- Улучшены эвристики resolver для meta-текстур: добавлены дополнительные meta-суффиксы (`_`, `/`, `.`, `-`), ранжирование кандидатов по meta и имени предмета, а рискованный fallback на grouped variants для meta-miss теперь отключён по умолчанию и включается только через `settings.fallback_to_first_variant_for_meta_miss`.
- Добавлены параметризованные тесты по `mods_json/*.json` для каждого мода с текстурами, чтобы проверять индексацию манифестов модов на реальных деревьях файлов.
- Исправлена индексация block-текстур из вложенных подпапок (например `textures/blocks/animated/...`): backend теперь регистрирует дополнительный alias-ключ по basename, из-за чего предметы вроде `<draconicrevolt:der_awakeneddemonicblock>` корректно резолвятся в иконку.
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
- Added a persisted UI preference `animations_enabled` with a new Settings panel toggle, allowing users to disable animated item icons globally for output and grid previews.
- Grid cells now use an expanded icon area (near full-cell preview) and include inline `Копировать / Вставить / Очистить` actions for faster per-cell editing without opening the craft modal.
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
