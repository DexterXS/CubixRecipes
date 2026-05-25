# update-parser

## When to use
- Use this skill when adding parser support for a new recipe/item syntax or fixing an incorrect parse result.

## Required context
- Read `AGENTS.md`.
- Read `backend/app/parsers/recipe_parser.py`.
- Read parser tests and the domain model fields the parser populates.

## Steps
1. Capture the exact input text that fails or needs support.
2. Add a failing parser test first when practical.
3. Change only parser logic needed for the syntax.
4. Preserve existing normalization and trim behavior.
5. Run focused parser tests.
6. Update docs/changelog when user-facing syntax support changes.

## Common mistakes
- Parsing with broad string replacements that break NBT or nested calls.
- Changing matrix trimming while adding unrelated syntax.
- Mixing parser changes with resolver/storage changes.

## Done criteria
- New syntax or fixed parse case is covered by tests.
- Existing parser tests still pass.
- Parser output remains compatible with service/storage code.
