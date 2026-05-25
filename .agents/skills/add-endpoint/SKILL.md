# add-endpoint

## When to use
- Use this legacy alias only when a task says "add endpoint" without specifying API details.
- Prefer `add-api-endpoint` for FastAPI work.

## Steps
1. Read `AGENTS.md`.
2. Decide whether the endpoint belongs to backend API routes, frontend API service calls, or both.
3. If backend API work is needed, switch to the `add-api-endpoint` workflow.
4. Keep endpoint behavior minimal and covered by focused tests.

## Done criteria
- The endpoint has a clear owner.
- The route does not contain business logic.
- Tests or a documented manual check cover the new behavior.
