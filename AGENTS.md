# AGENTS.md

## Purpose
This repository must be developed as a maintainable long-term project, not as a one-off prototype.

## Core rules
- Always preserve modular architecture.
- Do not place all logic in one file.
- Prefer small focused modules with clear responsibility.
- Keep backend and frontend separated.
- Before changing code, inspect README.md, CHANGELOG.md, and relevant skills.
- For complex tasks, use or create a skill in `.agents/skills`.
- After meaningful changes, update project documentation.

## Required project artifacts
The repository must maintain and keep updated:
- README.md
- CHANGELOG.md
- AGENTS.md
- `.agents/skills/*/SKILL.md`
- tests for critical logic
- docs/ when needed

## Documentation rules
Update README.md when any of the following changes:
- setup steps
- run commands
- project structure
- user-facing features
- developer workflow

Update CHANGELOG.md when:
- a feature is added
- behavior changes
- a bug is fixed
- architecture changes meaningfully

Update AGENTS.md when:
- a repeated mistake is discovered
- a new project rule is needed
- a new workflow becomes standard
- a design constraint should persist

## Development workflow
Before implementing:
1. Read root AGENTS.md
2. Read relevant local AGENTS.md if present
3. Check relevant skills in `.agents/skills`
4. Create a short plan for non-trivial work

After implementing:
1. Run tests relevant to changed code
2. Update docs if needed
3. Update CHANGELOG.md
4. Update AGENTS.md if a new persistent rule was learned
5. Update or add SKILL.md if a reusable complex procedure emerged

## Architecture rules
- Backend: FastAPI
- Frontend: React + Vite
- Keep domain logic separate from transport/API logic
- Keep parsing, storage, indexing, and resolver logic in separate modules
- Avoid hidden coupling between frontend and backend
- Prefer DTO/schema-based API contracts
- Make critical services testable in isolation

## Logging and project memory
Maintain these sections in this file over time:
- Improvement Log
- Error Log
- Change Notes
- Known Issues
- Technical Debt
- Decisions
- Next Iteration Notes

## Complex-task rule
If a task is complex, multi-step, risky, or likely to recur:
- first check `.agents/skills`
- if no suitable skill exists, create one
- execute using that skill
- improve the skill after completion

## Improvement Log
- Initial repository process rules created.

## Error Log
- None yet.

## Change Notes
- Initial project governance established.

## Known Issues
- Project-specific rules will need refinement after first implementation pass.

## Technical Debt
- No project-specific technical debt recorded yet.

## Decisions
- Repository-level guidance is stored in AGENTS.md.
- Reusable complex procedures are stored in `.agents/skills`.

## Next Iteration Notes
- Add project-specific commands after scaffold is generated.
- Add module-level AGENTS.md files if backend/frontend rules diverge.
