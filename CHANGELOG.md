# Changelog

## [Unreleased]
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

### Fixed
- Cleaned project instructions so AGENTS.md now contains only permanent workflow and maintenance rules.
