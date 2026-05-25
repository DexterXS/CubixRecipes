# debug-resolver

## When to use
- Use this skill when an item resolves to the wrong icon/name, no icon, a placeholder, or an unexpected resolver strategy.

## Required context
- Read `AGENTS.md`.
- Read `backend/app/resolver/item_resolver.py`.
- Read `backend/app/indexer/asset_index.py` only when indexed candidates or asset paths matter.

## Steps
1. Reproduce the item id, meta, and settings involved.
2. Inspect resolver trace and `last_resolution_details`.
3. Check whether the expected icon key exists in the asset index.
4. Fix the narrowest resolver strategy or index key generation issue.
5. Add a focused resolver/indexer test for the exact missed case.

## Common mistakes
- Enabling broad fallback behavior for all meta misses.
- Treating missing indexed assets as a resolver bug without checking scan input.
- Changing strategy order without a regression test.

## Done criteria
- The expected item resolves with a stable strategy.
- A test protects the resolved case and the nearest risky miss.
- Debug diagnostics remain useful and bounded.
