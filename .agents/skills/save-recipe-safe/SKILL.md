# save-recipe-safe

## When to use
- Use this skill when changing recipe save, save-as, file creation, write roots, or `.zs` source replacement.

## Required context
- Read `AGENTS.md`.
- Read `backend/app/storage/zs_storage.py`.
- Read save-related API schemas/routes/tests.

## Steps
1. Confirm the target path is inside allowed recipe roots.
2. Preserve source offsets or rebuild the affected file index safely.
3. Avoid full rescans unless the change explicitly requires them.
4. Keep rendered `.zs` syntax stable.
5. When a recipe has a preceding `recipes.remove(...)` statement, treat that statement and the add block as one replaceable source block.
6. Keep local uploaded-file edits separate from managed cloud/script saves unless the user explicitly chooses to upload or save through the backend.
7. Add tests for allowed writes, rejected writes, and post-save lookup behavior.
8. Update the optimization roadmap if save performance changes.

## Common mistakes
- Trusting a frontend path without backend validation.
- Replacing the wrong recipe block after offsets changed.
- Leaving a stale `recipes.remove(...)` line behind when replacing a recipe block.
- Full rescanning every source after a single-file edit without measuring cost.
- Losing the newly saved recipe uid.

## Done criteria
- Writes are path-safe.
- Updated recipes remain searchable.
- Tests cover success and rejection paths.
