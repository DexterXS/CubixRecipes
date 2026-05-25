# add-resolver-strategy

## When to use
- Use this skill when adding a new item/icon/name resolver strategy or changing resolver priority.

## Required context
- Read `AGENTS.md`.
- Read `backend/app/resolver/item_resolver.py`.
- Read relevant indexer behavior in `backend/app/indexer/asset_index.py`.
- Read resolver tests before editing.

## Steps
1. Identify the exact item ids/meta forms the strategy must support.
2. Decide where the strategy belongs in the resolver priority chain.
3. Add the narrowest matching logic possible.
4. Record trace details that explain why it matched or skipped.
5. Add tests for a positive match and the nearest false-positive risk.
6. Update debug notes/changelog if user-visible resolution changes.

## Common mistakes
- Adding broad prefix matching that steals matches from better strategies.
- Changing fallback behavior globally for one mod-specific case.
- Forgetting meta-specific miss tests.
- Hiding the matched key/source from debug diagnostics.

## Done criteria
- Strategy is ordered deliberately.
- Tests cover the new match and a nearby miss.
- Resolver trace remains useful.
