# modular-monolith

## When to use
- Use this skill when changing project structure, splitting large modules, introducing boundaries, or moving logic between API, services, domain, infrastructure, and frontend features.

## Required context
- Read `AGENTS.md`.
- Identify the existing owner module before moving code.
- Check imports so dependency direction stays simple.

## Target shape
- Backend: `api -> application/service -> domain -> infrastructure`.
- Frontend: feature modules for workflows, shared modules only for stable reusable pieces.
- One cohesive project, no premature microservices.

## Steps
1. Name the boundary being introduced or cleaned up.
2. Move one concern at a time.
3. Keep public API contracts stable unless the user approved a contract change.
4. Keep files small enough to reason about, but do not create thin wrapper modules without purpose.
5. Run focused tests for the moved behavior.
6. Update roadmap notes if the extraction changes future work.

## Common mistakes
- Creating a new folder without reducing coupling.
- Moving code and changing behavior in the same step.
- Letting routes/components keep business logic after an extraction.
- Splitting by file type instead of feature/ownership.

## Done criteria
- The moved concern has a clear owner.
- Imports follow the intended direction.
- Tests still cover the behavior.
- The diff is limited to the boundary being cleaned.
