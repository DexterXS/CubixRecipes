# AGENTS.md

# ============================================
# BOOTSTRAP MODE (INITIALIZATION INSTRUCTIONS)
# ============================================

## PURPOSE
This file contains BOTH:
1. Initial bootstrap instructions (temporary, must be cleaned later)
2. Long-term project rules (must remain after cleanup)

You MUST:
- Execute bootstrap instructions FIRST
- Then CLEAN this file and leave only permanent rules

---

# ============================================
# PHASE 1 — BOOTSTRAP (EXECUTE FIRST)
# ============================================

## GOAL
Transform this repository into a fully structured, maintainable, scalable project.

## REQUIRED ACTIONS

You must:

1. Create full project structure
2. Create backend (FastAPI)
3. Create frontend (React + Vite)
4. Create documentation files:
   - README.md
   - CHANGELOG.md
   - .agents/skills/*
5. Create base architecture (modular)
6. Create initial MVP implementation (based on project task)
7. Add basic tests
8. Establish internal project memory system
9. THEN CLEAN this file

---

## PROJECT STRUCTURE (MANDATORY)

Create structure:
project-root/
backend/
app/
api/
services/
domain/
parsers/
resolver/
indexer/
storage/
tests/
frontend/
src/
components/
pages/
features/
services/
types/
.agents/
skills/
README.md
CHANGELOG.md
AGENTS.md

---

## REQUIRED FILES

You MUST create:

### 1. README.md
Must include:
- project description
- features
- architecture
- setup instructions
- run instructions
- development guide
- project structure explanation
- roadmap

### 2. CHANGELOG.md
Format:
[Unreleased]
Added
Changed
Fixed
Add initial entry for project creation.

---

## SKILL SYSTEM INITIALIZATION

Create folder:
.agents/skills/
Create at least 5 skills:

- add-api-endpoint
- update-parser
- add-resolver-strategy
- save-recipe-safe
- debug-recipe-flow

Each skill must contain:

- When to use
- Steps
- Common mistakes
- Done criteria

---

## MVP REQUIREMENTS

Implement minimal working version:

- parsing logic
- basic API
- simple UI
- editable grid
- basic resolver (even stub)

---

## TESTS

Create:
- parser tests
- storage tests
- resolver tests

---

## CRITICAL RULE

DO NOT leave project half-structured.

---

# ============================================
# PHASE 2 — SELF-CLEANING (VERY IMPORTANT)
# ============================================

After bootstrap is complete:

## YOU MUST CLEAN THIS FILE

### REMOVE COMPLETELY:
- All bootstrap instructions
- All “PHASE 1”
- All project generation instructions
- All temporary explanations

### KEEP AND RESTRUCTURE:
- Core rules
- Architecture rules
- Skill system rules
- Development workflow

---

## FINAL FILE MUST CONTAIN ONLY:

1. Purpose
2. Core rules
3. Development workflow
4. Skill system
5. Architecture rules
6. Logging & memory system
7. Improvement sections

---

# ============================================
# PHASE 3 — PERMANENT PROJECT RULES
# (THIS MUST REMAIN AFTER CLEANUP)
# ============================================

## PURPOSE
This project must be maintainable, extensible, and self-improving.

---

## CORE RULES

- Never write monolithic code
- Always keep modular architecture
- Separate backend and frontend
- Keep logic layers isolated
- Avoid duplication
- Always think about future scalability

---

## DEVELOPMENT WORKFLOW

Before implementing:
1. Read AGENTS.md
2. Check existing skills
3. Plan approach

After implementing:
1. Update tests
2. Update README if needed
3. Update CHANGELOG
4. Update AGENTS if new rule discovered
5. Update or create SKILL if needed

---

## SKILL SYSTEM (CRITICAL)

### RULES

- Skills live in `.agents/skills`
- Skills are reusable workflows
- Skills must evolve

### BEHAVIOR

When task is:
- complex
- repetitive
- risky

You MUST:
1. Check existing skills
2. If none exists → create new
3. Use it
4. If it fails → improve it
5. Save improved version

---

## SKILL EVOLUTION RULE

If user says:
“this still doesn't work”

You MUST:
- treat it as skill failure
- update skill with:
  - missing steps
  - edge cases
  - validations

---

## ARCHITECTURE RULES

Backend:
- FastAPI
- modular services
- clear separation of concerns

Frontend:
- React + Vite
- component-based
- isolated features

---

## LOGGING & PROJECT MEMORY

Maintain in this file:

### Improvement Log
### Error Log
### Change Notes
### Known Issues
### Technical Debt
### Decisions
### Next Iteration Notes

---

## COMPLEX TASK RULE

If task is complex:
- do NOT improvise blindly
- use skill
- or create skill
- then execute

---

## QUALITY RULE

Code must be:
- readable
- modular
- testable
- maintainable

---

# ============================================
# PROJECT MEMORY (KEEP THIS)
# ============================================

## Improvement Log
- Initial system created

## Error Log
- None yet

## Change Notes
- Project initialized

## Known Issues
- None yet

## Technical Debt
- None yet

## Decisions
- Use AGENTS.md + SKILL system

## Next Iteration Notes
- Expand features
