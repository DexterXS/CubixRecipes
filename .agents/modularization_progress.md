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
- Created `frontend/src/features/diagnostics/ModReplacementPanel.tsx`.
  - Moved the technical-panel mod replacement UI out of `App.tsx`, including source mod selection, replacement mapping table, slot click/drop interactions, replace button, and NEI picker column.
  - Kept scan/replace API orchestration and recipe/item icon lookup in `App.tsx` for now and passed those values/callbacks into the panel.
  - Why this shape: the panel is a complete diagnostics/admin workflow surface and removes more than 100 lines from the page shell without changing persistence or backend behavior.
- Created `frontend/src/features/diagnostics/ItemCaseAliasPanel.tsx`.
  - Moved the technical-panel item case-alias report UI out of `App.tsx`, including report controls, FML log upload, manual alias form, alias table, and missing itempanel list.
  - Kept report generation, refresh, upload, and manual-save orchestration in `App.tsx` for now and passed those callbacks into the panel.
  - Why this shape: case-alias reporting is a complete diagnostics/admin surface and removes more than 100 lines from the page shell without changing API behavior.
- Created `frontend/src/features/diagnostics/DiagnosticsModIconsPanel.tsx`.
  - Moved the technical-panel mod icon archive upload/status UI and generated atlas preview grid out of `App.tsx`.
  - Kept archive upload/clean/delete/generate orchestration in `App.tsx` for now and passed those callbacks into the panel.
  - Why this shape: mod icon archive management is a complete diagnostics/admin surface and can move without changing icon resolver state.
- Created `frontend/src/features/item-catalog/ItemTextureToolsPanel.tsx`.
  - Moved the itempanel texture/icon cache controls out of `App.tsx`, including mod selection, load/pause/resume/cancel controls, and progress summary.
  - Kept texture loading and cache state in `App.tsx` for now because it still coordinates NEI item catalog visibility and localStorage.
  - Why this shape: texture loading presentation is item-catalog ownership, while the underlying cache workflow can be split later.
- Created `frontend/src/features/auctions/`.
  - Added the auction workspace as a new feature module instead of placing auction UI/generation logic in `App.tsx`.
  - Added planned/repeating auction config, timezone-aware UTC+0 command formatting, draggable 90-day price curves, NEI/catalog item picking, NBT visual warnings with command exclusion, extensionless download, and focused command-generation tests.
  - Updated the generator after server-ID clarification: new installs now generate step 1 empty slot creation, step 2 server-ID mapping, step 3 item insertion, and step 4 final configuration/schedule commands; existing auctions can skip slot creation and start from entered server IDs.
  - Updated pricing after graph clarification: prices now live on individual auction items, while the 90-day graph applies a percentage multiplier to all non-NBT item prices for the selected currency/day.
  - Added auction-local hover/focus help popovers so confusing fields such as local labels, server IDs, graph percentages, item prices, and staged downloads explain their purpose with examples.
  - Extracted the auction plan sidebar into `AuctionPlanPanel.tsx`, added the auction-local admin max-items setting, and showed an internal inventory preview with filled and future empty item slots for each auction.
  - Reworked the auction price graph from a 90-day polyline with sharp baseline spikes into a smooth Bezier/equalizer-style curve through auction date control points with a soft SVG fill.
  - Extracted the items/file mode into `AuctionItemsWorkspace.tsx` and replaced the awkward split panels with one right-side workspace: NEI catalog on the left, selected-auction internal inventory on the right.
  - Added shared run-price previews and `AuctionRunPricePreviewList.tsx`; repeat occurrences render on the graph as read-only markers, while repeating auctions keep the first-run price because the server repeat command does not support per-occurrence price changes.
  - Added `AuctionGraphsWorkspace.tsx` as the global graph-tab owner, combining the editable graph with a folder queue/status sidebar so `AuctionBuilder.tsx` only routes to the graph workspace.
  - Why this shape: auctions are a new product area, so the page shell should only route to the feature and adapt item catalog/icon data.

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
