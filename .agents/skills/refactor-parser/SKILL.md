# refactor-parser

## When to use
- Use this skill only when the parser structure itself must change without intentionally changing parsing behavior.

## Required context
- Read `AGENTS.md`.
- Read `backend/app/parsers/recipe_parser.py`.
- Read parser tests before editing.

## Steps
1. Identify the exact parser concern to extract or simplify.
2. Confirm existing behavior with focused tests.
3. Refactor in the smallest safe step.
4. Keep parser inputs/outputs and diagnostics stable.
5. Run parser tests after the change.

## Common mistakes
- Refactoring and adding new syntax support in the same change.
- Moving normalization rules without equivalent tests.
- Changing diagnostics accidentally.

## Done criteria
- Parser behavior is unchanged except for explicitly approved differences.
- Parser tests pass or any failure is clearly explained.
- No unrelated resolver/storage/frontend changes are included.
