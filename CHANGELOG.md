# Changelog

## [Unreleased]
### Added
- Initial CubixRecipes project bootstrap with FastAPI backend, React+Vite frontend, docs, skills, and MVP recipe/parser/storage/resolver flow.
- Added a root `start-dev.py` control panel with Start/Stop/Restart actions for backend and frontend; on Windows it launches the dev servers in separate consoles.


### Changed
- Replaced placeholder repository files with a structured modular architecture for backend and frontend development.
- Expanded `start-dev.py` with an in-window action log that explains launches, stops, restart reasons, and which managed processes can currently be stopped.
- Adjusted Windows frontend startup to run through `cmd /k npm run dev` and added a frontend dependency check so launch failures stay visible instead of the console closing immediately.

### Fixed
- Cleaned project instructions so AGENTS.md now contains only permanent workflow and maintenance rules.
