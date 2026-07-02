# Modularization Progress

Temporary file. Keep this file while the modular structure migration is in progress, update it after each completed split, and delete it on the final modularization step.

## Current Objective
- Move CubixRecipes toward a modular-monolith structure without changing behavior.
- Split oversized files by ownership and feature boundary, not by arbitrary line count.
- Keep existing public imports and API contracts stable during each extraction.

## Active Step
- Step: introduce the app-shell navigation boundary before deeper feature splits.
- Reason: `App.tsx` currently owns product navigation, server-context rendering, recipe workflows, item workflows, settings, and technical panels; the navigation/server context can move first without changing API or recipe behavior.
- Target shape: `frontend/src/app/` owns top-level workspace navigation and global server context UI, while feature modules continue to own their workflows.

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
- Created `frontend/src/features/nei/NeiIconItem.tsx`.
  - Moved shared NEI/favorite item-cell interaction into one feature component.
  - Added guarded touch behavior: scroll movement cancels pick, short tap picks, long press opens item inspection.
  - Why this shape: NEI item interaction must stay consistent across the NEI panel and favorite tabs instead of being duplicated in `App.tsx`.
- Created `frontend/src/features/nei-favorites/NeiFavoritesPanel.tsx`.
  - Moved favorite tab layout, `+` tab creation, and hidden `...` settings into a dedicated feature component.
  - Why this shape: favorite-tab UI is NEI-favorites ownership, while `App.tsx` keeps only profile state and persistence callbacks.
- Created `frontend/src/styles/nei.css`.
  - Moved NEI/favorites item-cell, browser-tab, settings-menu, and mobile inspection styles out of the oversized global stylesheet.
  - Why this shape: NEI presentation has its own ownership and should not grow `frontend/src/styles.css` or compress mobile styles.
- Created `frontend/src/styles/mobile.css`.
  - Added phone/tablet layout rules for recipe editor, craft grid, NEI/search panel, touch targets, and modals.
  - Kept mobile presentation separate from the existing large global stylesheet.
  - Added a touch-only held-item bar in the recipe builder so selected NEI items are visible without relying on the mouse cursor.
  - Why this shape: mobile behavior is a presentation concern shared by the current page shell, so it can be isolated now without moving unstable `App.tsx` state prematurely.
- Created `frontend/src/app/workspaceNavigation.ts`, `AppWorkspaceNav.tsx`, and `ServerContextChip.tsx`.
  - Moved top-level workspace tab definitions, product-oriented labels, visibility rules, desktop navigation rendering, and active server chip rendering out of `App.tsx`.
  - Added `workspaceNavigation.test.ts` for the navigation map and restricted-section filtering.
  - Why this shape: app-shell navigation and server context are global product concerns, not recipe-editor logic.
- Created `frontend/src/features/settings/AppSettingsModal.tsx`.
  - Moved the global settings modal UI for UI scale, NEI page size, shared draft mode, hotkey debug filters, and NEI favorite/filter preferences out of `App.tsx`.
  - Kept state and persistence callbacks in `App.tsx` so this extraction changes ownership without changing behavior.
  - Why this shape: settings presentation is a settings feature concern, while persistence still depends on broader app state until a later settings-state split.
- Created `frontend/src/features/diagnostics/TechnicalPanelShell.tsx`.
  - Moved the technical panel shell, sidebar navigation, section ID contract, and wipe-update sidebar action out of `App.tsx`.
  - Kept the actual debug/admin section content in `App.tsx` for this slice so behavior and data dependencies remain unchanged.
  - Why this shape: diagnostics navigation is a stable shell boundary and can move before splitting individual debug sections.
- Created `frontend/src/features/diagnostics/DebugEventsList.tsx`.
  - Moved debug event list rendering and debug event/category/level types out of `App.tsx`.
  - Kept event collection, filtering, and persistence in `App.tsx` because those still depend on global app interactions.
  - Why this shape: logs are a bounded diagnostics presentation concern and can move without touching debug event producers.
- Created `frontend/src/features/diagnostics/DiagnosticsLogsPanel.tsx`.
  - Moved the full technical-panel logs section out of `App.tsx`, including filter toggles, level toggles, event count, and debug event list composition.
  - Kept debug filter state and update callbacks in `App.tsx` for now because they are shared with the settings modal.
  - Why this shape: logs are the smallest complete diagnostics section and prove the section-content extraction pattern.
- Created `frontend/src/features/diagnostics/DiagnosticsRuntimePanel.tsx`.
  - Moved the technical-panel runtime section out of `App.tsx`, including UI state, backend/loading state, and computed action availability.
  - Kept the runtime value calculation in `App.tsx` so this remains a presentation-only extraction.
  - Why this shape: runtime status is a bounded diagnostics section and does not need recipe editor ownership.
- Created `frontend/src/features/diagnostics/DiagnosticsOverviewPanel.tsx`.
  - Moved the technical-panel overview section out of `App.tsx`, including status, recipe diagnostics, and quick debug values.
  - Kept all status and recipe value calculation in `App.tsx` so this remains a presentation-only extraction.
  - Why this shape: the default technical-panel overview is a bounded diagnostics presentation concern and can move without changing recipe/editor state.
- Created `frontend/src/features/diagnostics/DiagnosticsRecipePanel.tsx`.
  - Moved the technical-panel recipe diagnostics section out of `App.tsx`, including grid state, output status, and the output icon display slot.
  - Kept item icon rendering in `App.tsx` for now and passed the rendered output icon into the panel.
  - Why this shape: recipe diagnostics presentation can move before the broader recipe editor rendering split, without crossing item rendering ownership too early.
- Created `frontend/src/features/diagnostics/DiagnosticsAccessPanel.tsx`.
  - Moved the technical-panel access section layout out of `App.tsx`, including personnel, whitelist, and static role-permission reference blocks.
  - Kept role-management and whitelist forms in `App.tsx` for now and passed them as rendered content.
  - Why this shape: access layout is diagnostics presentation, while role and whitelist behavior still depend on wider app/admin state.

## Still Needed
- Continue splitting `frontend/src/pages/App.tsx` into feature modules.
- Continue splitting settings into a dedicated settings hub, with contextual shortcuts from recipes/items only.
- Continue splitting remaining technical-panel section content into diagnostics/admin modules instead of keeping all debug sections in the page shell.
- Split item/NEI/catalog workflows into an items feature area separate from recipe editing.
- Split recipe-editor/NEI UI rendering from `frontend/src/pages/App.tsx` once the mobile behavior stabilizes.
- Split large frontend tests/styles by feature once the related application modules exist.
- Split `backend/app/api/routes.py` into backend routers by API concern.

## Notes
- Do not delete this file until the whole modularization pass is complete.
- Update `.agents/knowledge_tree.md` after each ownership change.
