# add-api-endpoint

## When to use
- Use this skill when adding or changing a FastAPI endpoint in CubixRecipes.
- Use this for backend route contracts, matching frontend API client changes, and endpoint tests.

## Required context
- Read `AGENTS.md`.
- Read `backend/app/api/routes.py` and `backend/app/api/schemas.py`.
- Read the application service/storage/resolver module that owns the behavior.
- Read existing API tests for similar endpoints.

## Steps
1. Define the request/response contract before editing.
2. Put validation in schemas or the owning service, not inline route code.
3. Keep route handlers thin: parse request, call service, serialize response, map errors.
4. Add or update focused API tests.
5. Update frontend API client only if the frontend uses the endpoint.
6. Update docs/changelog only when behavior or user workflow changes.

## Common mistakes
- Adding business logic directly inside route handlers.
- Returning different response shapes from neighboring endpoints without a reason.
- Forgetting error status semantics.
- Triggering full rescans or heavy work from lightweight endpoint calls.

## Done criteria
- Endpoint contract is explicit and tested.
- Route code remains orchestration-only.
- Any heavy side effects are intentional and visible in the roadmap if performance-related.
