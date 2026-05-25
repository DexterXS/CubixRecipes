# debug-recipe-flow

## When to use
- Use this skill when recipe parsing, saving, searching, rendering, or UI display does not match the expected recipe flow.

## Required context
- Read `AGENTS.md`.
- Read parser, storage, service, and API code only for the failing path.
- Check existing parser/storage/API tests for the nearest case.

## Steps
1. Identify the failing operation: parse, resolve, edit, save, search, or render.
2. Reproduce with the smallest recipe text or matrix.
3. Follow the flow across parser -> service -> storage -> API -> frontend only as far as needed.
4. Fix the module that owns the broken behavior.
5. Add a regression test at the lowest useful layer.
6. Update project memory if the issue reveals a durable workflow rule.

## Common mistakes
- Fixing frontend symptoms when parser/storage output is wrong.
- Triggering a full architecture refactor for a single malformed recipe.
- Saving a recipe outside allowed roots.
- Dropping source offsets needed for safe in-file replacement.

## Done criteria
- The failing flow is reproduced and fixed.
- Regression coverage is in the closest appropriate test layer.
- No unrelated recipe formats or UI behavior changed.
