# Modularization Progress

Temporary file. Keep this file while the modular structure migration is in progress, update it after each completed split, and delete it on the final modularization step.

## Current Objective
- Move CubixRecipes toward a modular-monolith structure without changing behavior.
- Split oversized files by ownership and feature boundary, not by arbitrary line count.
- Keep existing public imports and API contracts stable during each extraction.

## Active Step
- Step: continue frontend modularization around recipe-editor and NEI/search workflow.
- Reason: `App.tsx` remains the largest structural risk; the first mobile pass touched recipe-editor/NEI UI behavior, so the next extraction should follow that ownership boundary.
- Target shape: extract recipe-editor UI/workflow pieces from the page shell while keeping mobile styles isolated in a dedicated stylesheet.

## Completed
- Added governance rules for file limits, script automation, and test-first workflow.
- Added `scripts/check_file_sizes.py` and verified it with a dry-run.
- Split `frontend/src/services/api.ts` into `frontend/src/services/api/` domain modules.
  - `client.ts`: shared request, error, auth-header, blob download behavior.
  - `recipes.ts`, `items.ts`, `itempanel.ts`, `auth.ts`, `tasks.ts`, `modIcons.ts`, `aliases.ts`, `zsCloud.ts`, `oredict.ts`, `modReplacement.ts`, `servers.ts`, `settings.ts`, `favorites.ts`: endpoint groups by backend concern.
  - `index.ts`: barrel export preserving existing `../services/api` imports.
  - Why this shape: API client ownership is split by backend/API concern while callers keep the same public import path.
- Created `frontend/src/features/recipe-editor/recipeMatrix.ts`.
  - Moved matrix clone/resize/trim/source-shape helpers and recipe type mapping out of `App.tsx`.
  - Added `recipeMatrix.test.ts` for trim/preserve/grid-size behavior.
  - Why this shape: matrix source-shaping is recipe-editor domain logic, not page-shell state or UI rendering.
- Created `frontend/src/features/mobile-shell/MobileAppMenu.tsx`.
  - Moved the phone app drawer for workspace tabs, server switching, language, settings, logout, and contextual editor tools into a dedicated mobile-shell feature.
  - Added `MobileAppMenu.test.tsx` for drawer navigation and editor-tool access.
  - Why this shape: global mobile navigation belongs to the app shell, not the recipe editor or page component.
- Created `frontend/src/styles/mobile-shell.css`.
  - Moved global mobile drawer styles out of `frontend/src/styles/mobile.css`.
  - Why this shape: app-shell mobile navigation has separate ownership from recipe workspace mobile layout and keeps both CSS files under the hard file-size limit.
- Created `frontend/src/features/recipe-editor/MobileRecipeWorkspace.tsx`.
  - Moved the editor workspace shell for recipe builder, recipe files, NEI, and NEI favorites out of `App.tsx`.
  - Added mobile NEI/Favorites tab state while keeping recipe file tools available for the app drawer.
  - Added `MobileRecipeWorkspace.test.tsx` for recipe-file fallback and tab behavior.
  - Why this shape: mobile editor workflow is recipe-editor UI ownership and should not stay embedded in the page shell.
- Created `frontend/src/styles/mobile.css`.
  - Added phone/tablet layout rules for recipe editor, craft grid, NEI/search panel, touch targets, and modals.
  - Kept mobile presentation separate from the existing large global stylesheet.
  - Added a touch-only held-item bar in the recipe builder so selected NEI items are visible without relying on the mouse cursor.
  - Why this shape: mobile behavior is a presentation concern shared by the current page shell, so it can be isolated now without moving unstable `App.tsx` state prematurely.

## Still Needed
- Continue splitting `frontend/src/pages/App.tsx` into feature modules.
- Split recipe-editor/NEI UI rendering from `frontend/src/pages/App.tsx` once the mobile behavior stabilizes.
- Split large frontend tests/styles by feature once the related application modules exist.
- Split `backend/app/api/routes.py` into backend routers by API concern.

## Notes
- Do not delete this file until the whole modularization pass is complete.
- Update `.agents/knowledge_tree.md` after each ownership change.
