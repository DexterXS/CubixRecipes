# Changelog

## [Unreleased]
### Fixed
- Backend parser now normalizes clipboard text that contains literal escaped whitespace sequences like `\n`/`\t`, so pasted `mods.avaritia.ExtremeCrafting.addShaped(...)` recipes parse correctly.
- Frontend input panel now auto-parses pasted or manually inserted `addShaped(...)` text instead of only updating the textarea, and the main toolbar action is labeled `Парсить` to better match its behavior.
- Frontend now shows an inline warning in the input panel when `/api/parse` cannot reach the backend, so connection-refused failures are visible even if the status panel is hidden.
- Backend resolver now skips malformed `models/item` texture references instead of crashing `/api/parse` with HTTP 500 when a mod asset uses `#layer0` or another invalid `layer0` value.

### Added
- Added zoned frontend docking layout with separate top-left, top-right, bottom, and sidebar drop targets, per-zone drag reorder, visible drop-zone highlighting, panel resize, and persisted native resizers for the main/sidebar split, top-left/top-right split, and top/bottom section heights.
- Added a utility-bar settings button with an explicit “save current window layout” action that writes the current panel arrangement and zone sizes back to the backend config for reuse on the next app start.
- Added structured backend debug diagnostics endpoints/state for config, recipe scans, asset scans, resolver traces, parse history, missing links, summary counters, and a ring-buffer unified log API that collects backend/frontend/API/UI events.
- Added a new Control Panel `Full Debug Log` tab with source/level filters, copy/save/clear controls, auto-scroll, `Test Debug Pipeline`, and explicit request diagnostics for the unified log URL/status/error body.
- Fixed backend asset indexing so `mods_dir` directories now scan nested `.jar`/`.zip` files, boot logs show raw/normalized config and final index paths, and resolver diagnostics include non-empty checked sources from real asset paths.
- Added project path configuration storage in `cubixrecipes.config.json`, backend settings endpoints, and a new Control Panel `Settings` tab with browse actions and path validation.
- Added recipe output rendering/editing in the React UI, including output resolution metadata in API responses for future icon/name display.

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
