# Changelog

## [Unreleased]
### Added
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
