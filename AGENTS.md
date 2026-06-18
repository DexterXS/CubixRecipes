# AGENTS.md

## Purpose
CubixRecipes must remain maintainable, extensible, modular, and self-improving while strictly avoiding unnecessary complexity, slow operations, and speculative behavior.

The target architecture is a modular monolith: one cohesive project/runtime surface with strict internal module boundaries. "Monolith" must never mean one large file, mixed layers, or hidden coupling.

---

## Core Rules
- Never write monolithic code.
- Always keep modular architecture.
- Separate backend and frontend.
- Keep logic layers isolated.
- Avoid duplication.
- Always think about future scalability.
- Code must be readable, modular, testable, and maintainable.
- Prefer modular-monolith evolution over service fragmentation until a clear runtime boundary is proven necessary.

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

### Local Site Verification
- Never start frontend dev servers, open localhost, or verify CubixRecipes as a local website unless the user explicitly asks for that in the current task.

### Before implementing
1. Read `AGENTS.md`.
2. Identify task scope (micro / normal / complex).
3. Check existing skills.
4. Locate exact files before coding.
5. If unclear → STOP and ask.
6. For optimization or architecture work, update and follow the active roadmap in this file before touching application code.

### After implementing
1. Update tests if logic changed.
2. Update `README.md` if needed.
3. Update `CHANGELOG.md`.
4. Update `AGENTS.md` if a new durable rule is discovered.
5. Update or create a skill if the workflow changed.
6. After every completed task, commit and push the finished changes directly to the GitHub `main` branch unless the user explicitly says not to push or asks for another branch/PR flow.

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
- Skills must be concrete. Empty placeholder skills are not allowed.
- If two skills overlap, keep the narrower skill for repeated exact work and use a broader coordination skill only for multi-step projects.

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

### Modular Monolith
- Keep one repo and one coordinated product boundary.
- Backend modules should follow `api -> application/service -> domain -> infrastructure` direction.
- Frontend modules should be feature-oriented and share only stable types/utilities through shared modules.
- Routes/components may orchestrate, but must not become the home for business rules, persistence rules, indexing algorithms, or large UI workflows.
- New modules must have clear ownership and tests where behavior changes.

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
- Measure before and after significant optimization work.
- Prefer incremental scans, caches with invalidation, and bounded debug payloads over repeated full recomputation.
- Heavy startup work must be lazy, cached, or explicitly tracked as a startup cost.

---

## Active Optimization Roadmap

### Current Goal
Build a maintainable modular monolith and remove major performance bottlenecks without broad rewrites.

### Tracking Rules
1. Keep this roadmap current while optimization work is active.
2. Move one stage at a time unless the user explicitly asks for parallel work.
3. Record measurable findings before changing behavior.
4. Do not start a later stage if an earlier stage exposes a blocking design decision.

### Stage 0: Agent Governance
- Status: completed.
- Clean `AGENTS.md` and `.agents/skills`.
- Add missing skills for optimization and modular-monolith work.
- Ensure future agents can continue the roadmap without rediscovery.

### Stage 1: Baseline Measurements
- Status: completed.
- Measure backend startup time.
- Measure recipe scan time.
- Measure asset scan time and memory-sensitive report sizes.
- Measure frontend build/test time and identify the heaviest UI workflows.
- Baseline on 2026-05-19:
  - `create_app(config_path=...)`: 6.902s, 33 routes.
  - `ZsStorage.scan(...)`: 0.113s, 3 files, 197 recipes, 9 scan errors.
  - `AssetIndex.scan_paths(...)`: 10.262s, 2 paths, 42,067 icon candidates, 39,667 icon keys, 34,652 icon assets, 5 models, 50 lang locales, 12 scan errors, 4 missing icons.
  - `frontend npm.cmd run build`: Vite build 1.42s, shell wall time about 4.5s.
  - `frontend npm.cmd run test`: 25 tests passed, Vitest duration 9.95s; `App.test.tsx` took about 6.339s.
  - Backend pytest could not run because current `venv` lacks `pytest`.

### Stage 2: Backend Startup and Scan Costs
- Status: in progress.
- Reduce mandatory startup scans.
- Make asset indexing lazy, cached, or background-tracked.
- Avoid full recipe rescans after single-file saves.
- Progress on 2026-05-19:
  - Asset scan now skips irrelevant files before reading bytes.
  - Texture PNGs are indexed from path/locator without loading binary content during scans.
  - `AssetIndex.scan_paths(...)`: 10.262s -> 2.988s with the same 42,067 icon candidates.
  - `create_app(config_path=...)`: 6.902s -> 1.553s with the same 33 routes.
  - Recipe save operations now rescan only the changed `.zs` file instead of all recipe sources.
  - `itempanel_icons`/NEI dump catalog is now the primary startup icon source; old asset scan is skipped during startup when the catalog is available and remains available via explicit index/debug rescans.
  - `create_app(config_path=...)` after itempanel catalog integration and startup asset-scan skip: about 2.001s.
  - Remaining Stage 2 work: consider persisted itempanel catalog cache if startup needs to go below about 1s.

### Stage 3: Asset Index and Resolver
- Status: next.
- Add safe persistent index cache or fingerprinting.
- Avoid reading irrelevant archive entries.
- Add resolver result caching and later batch resolve if needed.
- Prefer the `itempanel_icons` catalog over jar/assets heuristics; keep old resolver strategies as fallback/debug paths.

### Stage 4: API Modularization
- Status: pending.
- Split large route registration by concern.
- Move orchestration into application services.
- Keep response shapes stable.

### Stage 5: Frontend Modularization
- Status: in progress.
- Split `frontend/src/pages/App.tsx` by feature and hooks.
- Keep UI behavior stable while extracting item search, layout, recipe editor, and debug panels.
- Progress on 2026-05-20:
  - Removed dynamic workspace drag/drop, drop targets, and resizer controls.
  - Replaced the draggable zone layout with a fixed three-column workspace while preserving panel visibility controls and modal workflows.
  - Added top-level workspace tabs for editor/recipe/items/debug flows.
  - Moved itempanel texture-cache controls out of the global header into the items tab.
  - Added persisted dark/light theme mode with a compact sun/moon toggle.

### Stage 6: Frontend Performance
- Status: pending.
- Optimize itempanel loading/search.
- Bound localStorage caches.
- Reduce redundant debug/API calls.

### Stage 7: Documentation and Regression Guardrails
- Status: pending.
- Update README/CHANGELOG only when user-facing or workflow behavior changes.
- Add focused tests for each optimized behavior.

---

## Logging & Project Memory

### Improvement Log
- Initial structured FastAPI + React/Vite MVP created.
- Agent governance cleaned: modular-monolith target, active optimization roadmap, and concrete local skills are now tracked.

### Error Log
- Browser screenshot tool unavailable in this environment.
- Backend pytest unavailable in current `venv`: `No module named pytest`.

### Change Notes
- Added parser, storage, resolver, indexer, API routes, frontend editor, tests, wiki, and reusable skills.
- Added optimization/modular-monolith roadmap and filled empty local skill files.
- Captured Stage 1 optimization baseline; asset scan is the dominant measured backend cost.
- Optimized asset indexing to avoid unnecessary file reads while preserving indexed icon counts.
- Optimized recipe storage saves to use changed-file rescans instead of full recipe rescans.
- Added NEI/itempanel icon catalog as the primary icon resolver source and filtered bad dump icons before UI display.
- Frontend workspace now uses task tabs and a theme toggle; texture-cache actions live in the items tab instead of the global header.
- Added Minecraft 1.7.10 remove-template recipe rendering, local uploaded `.zs` save choices, CSV itempanel refresh, whitelist mode, and configurable 9x9 grouping gaps.

### Known Issues
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
- Start Stage 2 with backend startup/asset scan cost reduction.

---

## Improvement Policy

After every significant change:
- Review logs.
- Update skills if needed.
- Improve weak spots.
- Reduce future ambiguity.
