# performance-optimization

## When to use
- Use this skill for performance work involving startup time, scanning, indexing, resolver speed, frontend render cost, API chatter, or cache behavior.

## Required context
- Read `AGENTS.md`, especially Active Optimization Roadmap.
- Read only the modules directly involved in the suspected bottleneck.
- Check existing tests for the affected module before editing.

## Steps
1. Identify the exact operation to optimize and its current trigger path.
2. Add or collect a baseline measurement before changing behavior.
3. Find the smallest bounded change that removes repeated work, heavy startup work, or unbounded data growth.
4. Preserve API response shapes and existing UI behavior unless the user approved a behavior change.
5. Add focused tests for cache invalidation, incremental updates, or error behavior.
6. Update `AGENTS.md` roadmap status and `CHANGELOG.md` when behavior changes.

## Common mistakes
- Optimizing without a baseline.
- Adding a cache without invalidation rules.
- Moving slow work from backend startup into a frontend loop.
- Logging large payloads while claiming a performance improvement.
- Refactoring unrelated modules during an optimization task.

## Done criteria
- There is a before/after observation or a clear benchmark note.
- The optimized path is covered by focused tests where practical.
- The roadmap stage is updated.
- No unrelated files were modified.
