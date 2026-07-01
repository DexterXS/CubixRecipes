# file-size-guard

## When to use
- Use this skill before adding logic to a file near or above the project line limits.
- Use this skill when splitting large files, reviewing modularization risk, or checking whether a change should create a new module folder.

## Required context
- Read `AGENTS.md`.
- Check `.agents/knowledge_tree.md` for the current owner of the touched feature.
- Run `python scripts/check_file_sizes.py --root .` when a size report is useful.

## Rules
1. Treat 300 lines as the target size for normal application files.
2. Treat 400 lines as the point where new logic needs a split check.
3. Treat 500 lines as the hard limit for normal application code.
4. Do not split by arbitrary chunks. Split by feature, layer, or ownership.
5. If a file is already over 500 lines, only make a tiny scoped fix there; otherwise extract the touched concern first.

## Preferred split shapes
- Backend API: move endpoint groups into `backend/app/api/routers/*`.
- Backend behavior: move business logic into services, storage, domain, or infrastructure modules by ownership.
- Frontend UI: move feature workflows into `frontend/src/features/<feature>/`.
- Frontend hooks/helpers: move stable logic into feature-local hooks/utilities before using shared modules.
- API client: split by backend domain behind a stable barrel export.

## Done criteria
- The changed file does not grow past the hard limit unless the task explicitly documents an exception.
- New modules have clear ownership and import direction.
- `.agents/knowledge_tree.md` is updated when ownership or file mapping changes.
- Focused verification or a dry-run proves the split did not break the touched behavior.
