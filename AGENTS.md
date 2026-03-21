# AGENTS.md

## Purpose
CubixRecipes must remain maintainable, extensible, modular, and self-improving while separating backend, frontend, parser, storage, resolver, and indexing responsibilities.

## Core Rules
- Never write monolithic code.
- Always keep modular architecture.
- Separate backend and frontend.
- Keep logic layers isolated.
- Avoid duplication.
- Always think about future scalability.
- Code must be readable, modular, testable, and maintainable.

## Development Workflow
### Before implementing
1. Read `AGENTS.md`.
2. Check existing skills.
3. Plan the approach.

### After implementing
1. Update tests.
2. Update `README.md` if needed.
3. Update `CHANGELOG.md`.
4. Update `AGENTS.md` if a new durable rule is discovered.
5. Update or create a skill if the workflow changed.

## Skill System
### Rules
- Skills live in `.agents/skills`.
- Skills are reusable workflows.
- Skills must evolve.

### Behavior
When a task is complex, repetitive, or risky:
1. Check existing skills.
2. If none exists, create a new one.
3. Use it.
4. If it fails, improve it.
5. Save the improved version.

### Skill Evolution Rule
If a user reports that something still does not work:
- treat it as a skill failure;
- update the skill with missing steps, edge cases, and validations.

## Architecture Rules
### Backend
- FastAPI.
- Modular services.
- Clear separation of concerns.

### Frontend
- React + Vite.
- Component-based design.
- Isolated features.

## Logging & Project Memory
### Improvement Log
- Initial structured FastAPI + React/Vite MVP created.

### Error Log
- Browser screenshot tool unavailable in this environment, so visual artifact capture could not be produced automatically.

### Change Notes
- Added parser, storage, resolver, indexer, API routes, frontend editor, tests, wiki, and reusable skills.

### Known Issues
- Icon binary streaming is still a placeholder endpoint in MVP.
- Soft binding and advanced resolver heuristics are scaffolded but not fully implemented.

### Technical Debt
- Replace in-memory asset/status stores with persisted cache/SQLite.
- Expand renderer/parser coverage for more CraftTweaker variants.

### Decisions
- Use `.zs` files as source of truth.
- Keep resource indexing and recipe storage as separate modules.
- Preserve Russian-language UI/docs for user-facing flows.

### Next Iteration Notes
- Add true trim-view logic, icon binary serving, and richer resolver/model traversal.

## Improvement Sections
- Review project memory sections after every major feature or bugfix.
