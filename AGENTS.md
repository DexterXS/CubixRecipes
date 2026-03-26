# AGENTS.md

## Purpose
CubixRecipes must remain maintainable, extensible, modular, and self-improving while strictly avoiding unnecessary complexity, slow operations, and speculative behavior.

---

## Core Rules
- Never write monolithic code.
- Always keep modular architecture.
- Separate backend and frontend.
- Keep logic layers isolated.
- Avoid duplication.
- Always think about future scalability.
- Code must be readable, modular, testable, and maintainable.

### Critical Behavior Rules
- NEVER assume missing information.
- ALWAYS ask clarifying questions if anything is unclear.
- NEVER generate placeholder or fake implementations.
- NEVER modify unrelated files.
- NEVER refactor unless explicitly requested.

---

## Execution Modes

### Default Mode: cautious
Use this mode unless explicitly told otherwise.

Behavior:
1. Analyze first.
2. Identify relevant files.
3. Ask questions if ambiguity exists.
4. Propose a minimal plan.
5. WAIT for confirmation.
6. Only then implement.

### Micro Task Mode
For very small tasks (e.g. rename button, change text):

- DO NOT scan the whole repository.
- Limit scope to 1–2 files.
- DO NOT refactor.
- DO NOT optimize.
- DO NOT add improvements.
- Perform only the requested change.
- Show exact diff after change.

### Fast Mode (only if explicitly requested)
- Skip questions.
- Implement directly.
- Still avoid breaking functionality.

---

## Development Workflow

### Before implementing
1. Read `AGENTS.md`.
2. Identify task scope (micro / normal / complex).
3. Check existing skills.
4. Locate exact files before coding.
5. If unclear → STOP and ask.

### After implementing
1. Update tests if logic changed.
2. Update `README.md` if needed.
3. Update `CHANGELOG.md`.
4. Update `AGENTS.md` if a new durable rule is discovered.
5. Update or create a skill if the workflow changed.

---

## Task Execution Rules

### Step-by-step execution
For non-trivial tasks:
1. Analyze codebase.
2. Identify dependencies.
3. Highlight risks.
4. Ask clarifying questions (if needed).
5. Propose minimal safe plan.
6. Wait for approval.
7. Implement changes.
8. Show diff + summary.

### Strict Limitation Rule
- Do not expand task scope.
- Do not "improve unrelated things".
- Do not redesign architecture unless explicitly asked.

---

## Skill System

### Rules
- Skills live in `.agents/skills`.
- Skills are reusable workflows.
- Skills must evolve.

### Behavior
When a task is complex, repetitive, or risky:
1. Check existing skills.
2. If none exists, create a new one.
3. Use it.
4. If it fails, improve it.
5. Save the improved version.

### Skill Evolution Rule
If something does not work:
- treat it as a skill failure;
- update the skill with missing steps, edge cases, and validations;
- ensure failure cannot repeat.

---

## Architecture Rules

### Backend
- FastAPI.
- Modular services.
- Clear separation of concerns.
- No business logic in routes.

### Frontend
- React + Vite.
- Component-based design.
- Isolated features.
- No logic leakage between components.

---

## Performance Rules

- Prefer minimal changes over global changes.
- Avoid full-repo scans unless necessary.
- Avoid long-running operations for small tasks.
- Always choose the fastest correct approach.

---

## Logging & Project Memory

### Improvement Log
- Initial structured FastAPI + React/Vite MVP created.

### Error Log
- Browser screenshot tool unavailable in this environment.

### Change Notes
- Added parser, storage, resolver, indexer, API routes, frontend editor, tests, wiki, and reusable skills.

### Known Issues
- Icon binary streaming is still a placeholder endpoint.
- Resolver heuristics not fully implemented.

### Technical Debt
- Replace in-memory stores with persistent storage.
- Expand parser coverage.

### Decisions
- `.zs` files are source of truth.
- Resource indexing and recipe storage are separate.
- Russian UI/docs preserved.

### Next Iteration Notes
- Implement trim-view logic.
- Add icon binary serving.
- Improve resolver traversal.

---

## Improvement Policy

After every significant change:
- Review logs.
- Update skills if needed.
- Improve weak spots.
- Reduce future ambiguity.
