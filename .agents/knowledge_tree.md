# CubixRecipes Knowledge Tree

Last full rebuild: 2026-06-29

## Usage Contract
- This file is the primary project knowledge source for future tasks.
- Before opening code for a task, consult this tree and identify the smallest affected file set.
- Do not rescan the whole repository unless the user explicitly says: "Перестрой дерево знаний полностью".
- After project changes, update only the affected branches and dependency links in this tree.
- If this tree conflicts with code, inspect only the touched files, then update this tree.

## Project Shape
- Architecture: modular monolith with one backend runtime and one frontend SPA.
- Backend: FastAPI application under `backend/app`.
- Frontend: React + Vite application under `frontend/src`.
- Admin shell: PySide/control scripts in `admin_panel.py`, `start-dev.py`, plus packaged `CubixRecipes_Admin.exe`.
- Local workflows and agent rules: `AGENTS.md`, `.agents/skills/*`, `.agents/knowledge_tree.md`, temporary `.agents/modularization_progress.md`.
- Project automation scripts: `scripts/*`, plus owner-specific scripts under `backend/scripts/`, `frontend/scripts/`, or `.agents/scripts/` when needed.
- Static/catalog data: root `itempanel.csv`, `itempanel.json`, `oredict.txt`, `mods_json/*.json`, `itempanel_icons/`, `frontend/public/itempanel.csv`, `frontend/public/itempanel-atlas.json`, `frontend/public/itempanel-atlas.png`.

## Runtime Data Model
- Primary recipe source of truth: CraftTweaker `.zs` files from configured `scripts_dir` plus configured extra recipe sources.
- Main filesystem state:
  - `cubixrecipes.config.json`: project path config and UI preferences.
  - `.cubixrecipes_admin/servers.json`: server registry.
  - `.cubixrecipes_admin/servers/{server_id}/config.json`: per-server project config.
  - `.cubixrecipes_admin/servers/{server_id}/itempanel/itempanel.csv`: uploaded per-server itempanel CSV.
  - `.cubixrecipes_admin/servers/{server_id}/itempanel/itempanel.json`: uploaded per-server line-based SNBT dump.
  - `.cubixrecipes_admin/servers/{server_id}/itempanel/itempanel_merged.csv`: explicit merged CSV/SNBT output.
  - `.cubixrecipes_admin/servers/{server_id}/itempanel_icons/`: per-server itempanel icon source.
  - `.cubixrecipes_admin/servers/{server_id}/recipe_draft_templates.json`: shared/admin recipe draft templates.
  - `.cubixrecipes_admin/servers/{server_id}/recipe_tasks.json`: admin task board.
  - `.cubixrecipes_admin/servers/{server_id}/custom_items/`: backend custom item files.
  - `.cubixrecipes_admin/servers/{server_id}/mod_icon_archives/`: uploaded icon ZIP archives.
  - `.cubixrecipes_admin/servers/{server_id}/mod_icon_atlases/`: generated mod icon atlas manifests and PNG pages.
  - `.cubixrecipes_admin/servers/{server_id}/item_case_aliases/`: generated/manual item case alias reports.
  - `.cubixrecipes_admin/servers/{server_id}/secret_zs_backups/`: root/admin `.zs` backups.
  - runtime `servers/{server_id}/nei_favorites.json`: moderator/admin NEI favorites.
- SQL tables:
  - `users`: Google-authenticated users, roles, timestamps, unique `google_sub` and `email`.
  - `custom_items`: declared in auth database model for owner/global item records, unique owner/raw pair.

## Automation and Governance Scripts
- `scripts/check_file_sizes.py`
  - Reports text/code files above the project warning and hard line-count limits.
  - Default mode is a safe report that exits successfully; use `--enforce` when a hard-limit violation should fail the command.
  - Default thresholds follow `AGENTS.md`: warning above 400 lines, hard limit above 500 lines.
  - Use before adding logic to files near the limit and during modularization work.

## Local Governance Skills
- `.agents/skills/file-size-guard/SKILL.md`: workflow for checking file-size risk and splitting by ownership instead of arbitrary chunks.
- `.agents/skills/script-automation/SKILL.md`: workflow for turning repeated deterministic tasks into reusable scripts with dry-run/test verification.
- `.agents/skills/modular-monolith/SKILL.md`: workflow for structure changes and module boundary cleanup.
- `.agents/skills/project-rules/SKILL.md`: workflow for changing AGENTS, roadmap, and local skills.

## Backend Modules

### Entrypoint and API
- `backend/app/main.py`
  - Owns ASGI app creation by importing `create_app` from `backend/app/api/routes.py`.
- `backend/app/api/routes.py`
  - Current largest orchestration module.
  - Main classes: `ContextProxy`, `PathProxy`.
  - Main functions: `create_app`, `serialize_recipe`, `_resolve_recipe_items`, auth/OAuth helpers, CORS/session helpers, itempanel path helpers.
  - Creates FastAPI app, middleware, server-context routing, services, and endpoints.
  - Depends on nearly all backend services and stores.
- `backend/app/api/schemas.py`
  - Pydantic request models for parse/search/save/resolve/custom items/drafts/tasks/favorites/settings/auth/access/debug/mod replacement.
  - Key classes: `ParseRequest`, `SearchRequest`, `IngredientSearchRequest`, `BatchSearchRequest`, `CreateRecipeRequest`, `SaveAsRequest`, `UpdateRecipeRequest`, `ResolveRequest`, `CustomItemRequest`, `RecipeDraftTemplateRequest`, `RecipeTask*Request`, `Nei*Request`, `ProjectSettingsRequest`, `RoleUpdateRequest`, `AccessControlRequest`, `DebugLogEventRequest`, `ModReplacementRequest`.

### Domain
- `backend/app/domain/models.py`
  - Shared backend domain objects.
  - Classes/enums: `MetaMode`, `BindingMode`, `ItemRef`, `RecipeCell`, `RecipeSource`, `Recipe`, `ResolutionResult`, `AssetCandidate`.
  - Used by parser, storage, resolver, item catalog, debug, and recipe service.

### Config
- `backend/app/config/project_config.py`
  - Project paths, UI preferences, data-dir defaults, validation, runtime directory creation.
  - Classes: `PanelLayoutItemConfig`, `WorkspaceLayoutConfig`, `UiPreferencesConfig`, `ProjectPathsConfig`, `ProjectConfigService`.
  - Reads/writes config JSON; builds recipe scan paths and icon index paths.
  - Recognizes `CUBIXRECIPES_DATA_DIR`, Railway volume env, and `/data`.

### Auth and Access
- `backend/app/auth/database.py`
  - SQLAlchemy models and session factory.
  - Tables/classes: `UserRecord` -> `users`, `CustomItemRecord` -> `custom_items`, `Base`.
  - Functions: `utc_now`, `normalize_database_url`, `build_session_factory`.
- `backend/app/auth/service.py`
  - Google user upsert/list/role operations.
  - Classes: `PublicUser`, `AuthService`.
  - Depends on `auth.database` and `auth.permissions`.
- `backend/app/auth/permissions.py`
  - Role normalization and route permission mapping.
  - Functions: `normalize_email`, `is_root_admin_email`, `normalize_role`, `role_has_permission`, `permission_for_request`.
- `backend/app/auth/access_control.py`
  - Whitelist/access mode JSON store.
  - Classes: `AccessControlConfig`, `AccessControlStore`.

### Recipe Parsing and Rendering
- `backend/app/parsers/recipe_parser.py`
  - Parses CraftTweaker/MineTweaker/Avaritia shaped, shapeless, pattern/key, item refs, metadata, wildcard, NBT suffixes, remove statements, escaped whitespace.
  - Classes: `ParseResult`, `RecipeParser`.
  - Depends on `domain.models`.
- `backend/app/services/recipe_service.py`
  - Use-case layer for parse/create/update/render operations.
  - Class: `RecipeService`.
  - Depends on `RecipeParser`, `ZsStorage`, and domain models.
- `backend/app/storage/zs_storage.py`
  - Scans `.zs` files, indexes recipes, searches by output/ingredient, saves existing recipes, appends save-as recipes, creates/reads/deletes/renames managed `.zs` files, prevents unsafe writes, rescans changed files.
  - Classes: `StoredRecipe`, `ZsStorage`.
  - Depends on `RecipeParser` and domain models.

### Item and Catalog Data
- `backend/app/items/item_catalog.py`
  - Builds backend item catalog from itempanel CSV, SNBT, icon availability, OreDict.
  - Classes/functions: `ItemCatalogEntry`, `ItemCatalogService`, `build_item_raw`.
  - Depends on `ItemPanelIconCatalog`, `itempanel_merge`, `oredict_parser`, and domain item refs.
- `backend/app/items/itempanel_merge.py`
  - Merges `itempanel.csv` rows with line-based SNBT from `itempanel.json`.
  - Classes/functions: `ItemPanelMergeReport`, `read_csv_rows`, `read_snbt_lines`, `extract_top_level_id`, `extract_top_level_damage`, `has_nbt_tag`, `extract_tag_snbt`, `merge_itempanel_csv_with_snbt`.
- `backend/app/items/oredict_parser.py`
  - Parses `oredict.txt` into group and reverse indexes.
  - Functions: `parse_oredict_groups`, `parse_oredict_reverse`, `build_oredict_indexes`.
- `backend/app/items/custom_items.py`
  - File-backed custom item store.
  - Class: `CustomItemService`.
  - Depends on auth permissions for visibility/ownership.

### Resource Indexing and Resolution
- `backend/app/indexer/asset_index.py`
  - Indexes icons, models, lang entries, animation metadata, and mods JSON manifests from mods/assets/extra icon sources.
  - Class: `AssetIndex`.
  - Used by resolver, debug, routes, server context.
- `backend/app/indexer/itempanel_icon_catalog.py`
  - Scans itempanel CSV plus `itempanel_icons`, detects missing/bad icons, builds atlas data without requiring Pillow.
  - Classes: `ItemPanelIconEntry`, `ItemPanelIconCatalog`.
  - Primary startup icon source when available.
- `backend/app/resolver/item_resolver.py`
  - Resolves `ItemRef` to icon/name/confidence through itempanel catalog, manual overrides, model texture links, lang lookup, grouped candidates, meta-specific strategies, and fallback asset paths.
  - Class: `ItemResolver`.
  - Depends on `AssetIndex`, `ItemPanelIconCatalog`, and domain models.
- `backend/app/services/mod_icon_atlas_service.py`
  - Uploads/validates/cleans mod icon ZIP archives and packs generated per-size shared atlas pages.
  - Classes: `ArchiveAlreadyExistsError`, `ArchiveNotFoundError`, `InvalidModIconArchiveError`, `ModIconSource`, `ModIconAtlasService`.

### Server and Admin State
- `backend/app/services/server_manager.py`
  - Multi-server isolation layer.
  - Classes: `ServerManager`, `ServerContext`.
  - Creates per-server config, storage, item catalogs, icon catalogs, resolver, drafts, tasks, favorites, custom items, case aliases, cloud backup service, and mod icon service.
  - Migrates legacy global data into default `hitech` server context.
- `backend/app/storage/recipe_tasks.py`
  - JSON-backed admin task board.
  - Class: `RecipeTaskStore`.
- `backend/app/storage/recipe_drafts.py`
  - JSON-backed shared/admin draft templates.
  - Class: `RecipeDraftTemplateStore`.
- `backend/app/storage/nei_favorites.py`
  - JSON-backed per-user NEI favorite tabs and hidden patterns.
  - Class: `NeiFavoritesStore`.
- `backend/app/storage/zs_cloud.py`
  - Cloud-file backup metadata and backup reads.
  - Class: `ZsCloudBackupService`.
- `backend/app/services/item_case_alias_service.py`
  - Generates and persists lowercase/original-case item/entity alias reports from scripts, itempanel keys, and FML logs.
  - Classes: `_AliasCandidate`, `ItemCaseAliasService`.

### Debugging
- `backend/app/debug/models.py`
  - Debug DTOs: `DebugIssue`, `DebugPathEntry`, `RecipeBlockDiagnostic`, `RecipeFileDiagnostic`, `AssetSourceDiagnostic`, `ResolverDiagnostic`, `ParseDiagnostic`, `DebugSnapshot`.
- `backend/app/debug/debug_service.py`
  - Builds debug snapshots across config, recipes, assets, parser, and resolver.
  - Class: `DebugService`.
- `backend/app/debug/log_service.py`
  - In-memory/file-friendly debug event log.
  - Classes: `DebugLogEvent`, `DebugLogService`.

### Backend Tests
- `backend/app/tests/test_api_routes.py`: integration-style API route coverage.
- `backend/app/tests/test_parser.py`: parser matrix/item/NBT/remove/shapeless coverage.
- `backend/app/tests/test_storage.py`: recipe search/save/rescan/write safety coverage.
- `backend/app/tests/test_resolver.py`: resolver strategy coverage.
- `backend/app/tests/test_item_catalog.py`: CSV/SNBT/catalog ordering/NBT authority coverage.
- `backend/app/tests/test_itempanel_icon_catalog.py`: icon catalog and atlas behavior.
- `backend/app/tests/test_mod_icon_atlas_service.py`: mod icon ZIP and atlas packing.
- `backend/app/tests/test_auth_permissions.py`: auth role/permission rules.
- `backend/app/tests/test_server_manager.py`: server context fallback behavior.
- `backend/app/tests/test_project_config.py`: data-dir/config defaults.
- `backend/app/tests/test_asset_index_performance.py`: scan performance guard.
- `backend/app/tests/test_mods_json_manifests.py`: `mods_json` manifest indexability.

## Backend API Surface

### Auth and Admin Access
- `GET /api/auth/me`
- `GET /api/auth/google/start`
- `GET /api/auth/google/callback`
- `POST /api/auth/logout`
- `GET /api/admin/users`
- `PATCH /api/admin/users/{user_id}/role`
- `GET /api/admin/access`
- `PUT /api/admin/access`

### Tasks and Favorites
- `GET /api/admin/tasks`
- `POST /api/admin/tasks`
- `PATCH /api/admin/tasks/{task_id}`
- `PUT /api/admin/tasks/order`
- `PUT /api/admin/tasks/board`
- `DELETE /api/admin/tasks/{task_id}`
- `GET /api/nei/favorites`
- `PUT /api/nei/favorites`

### Itempanel, OreDict, Mod Icons, Aliases
- `POST /api/admin/itempanel/csv`
- `POST /api/admin/itempanel/json`
- `POST /api/admin/itempanel/merge`
- `GET /api/admin/itempanel/merged`
- `GET /api/itempanel/catalog`
- `GET /api/itempanel/atlas`
- `GET /api/itempanel/atlas.png`
- `POST /api/admin/oredict/upload`
- `GET /api/api/oredict/groups`
- `GET /api/api/oredict/item/{item_key:path}`
- `GET /api/admin/mod-icons`
- `POST /api/admin/mod-icons/archive`
- `GET /api/admin/mod-icons/archive`
- `DELETE /api/admin/mod-icons/archive`
- `POST /api/admin/mod-icons/archive/clean`
- `POST /api/admin/mod-icons/generate`
- `GET /api/admin/mod-icons/atlases/{filename}`
- `GET /api/mod-icons/atlas`
- `GET /api/mod-icons/atlases/{filename}`
- `GET /api/admin/item-case-aliases`
- `GET /api/item-case-aliases`
- `POST /api/admin/item-case-aliases/generate`
- `POST /api/admin/item-case-aliases/manual`
- `POST /api/admin/item-case-aliases/fml-log`

### Recipe and `.zs` Workflows
- `POST /api/parse`
- `POST /api/recipes/search`
- `POST /api/recipes/uses`
- `POST /api/recipes/search-batch`
- `GET /api/recipes/{recipe_uid}`
- `PUT /api/recipes/{recipe_uid}`
- `POST /api/recipes/create`
- `POST /api/recipes/save-as`
- `GET /api/zs/files`
- `POST /api/zs/files/create`
- `GET /api/admin/zs-cloud/files`
- `GET /api/admin/zs-cloud/files/download`
- `POST /api/admin/zs-cloud/files/upload`
- `DELETE /api/admin/zs-cloud/files`
- `PATCH /api/admin/zs-cloud/files/rename`
- `GET /api/admin/zs-cloud/backups`
- `GET /api/admin/zs-cloud/backups/{backup_id}/download`
- `GET /api/admin/mod-replacement/scan`
- `POST /api/admin/mod-replacement/replace`

### Index, Resolve, Settings, Debug, Servers
- `POST /api/index/scan`
- `GET /api/index/status/{scan_id}`
- `POST /api/items/resolve`
- `GET /api/items/custom`
- `POST /api/items/custom`
- `DELETE /api/items/custom/{item_id}`
- `GET /api/recipe-drafts/templates`
- `POST /api/recipe-drafts/templates`
- `DELETE /api/recipe-drafts/templates/{draft_id}`
- `GET /api/settings/project`
- `PUT /api/settings/project`
- `PUT /api/settings/project/ui`
- `POST /api/debug/recipes/rescan`
- `POST /api/debug/assets/rescan`
- `GET /api/debug/config`
- `GET /api/debug/recipes`
- `GET /api/debug/assets`
- `GET /api/debug/resolver`
- `GET /api/debug/parse`
- `POST /api/debug/clear`
- `POST /api/debug/log`
- `GET /api/debug/log`
- `POST /api/debug/log/clear`
- `GET /api/debug/log/export`
- `GET /api/debug/summary`
- `GET /api/icons/{icon_asset_id:path}`
- `GET /api/servers`
- `POST /api/servers`
- `PUT /api/servers/{server_id}`
- `DELETE /api/servers/{server_id}`
- `GET /api/health`

## Frontend Modules

### Entrypoint and Shell
- `frontend/src/main.tsx`
  - Renders auth gate, server gate, and main `App`.
  - Components/types: `ServerGate`, `ServerGateProps`.
  - Depends on `AuthGate`, `ServerSelect`, `App`, global styles, mobile styles, debug logging, and shared types.
- `frontend/src/pages/App.tsx`
  - Central SPA workflow module and current biggest frontend file.
  - Owns workspace tabs, editor state, NEI/itempanel loading, local draft caches, cloud `.zs` operations, admin technical panel, item/NBT editor state, recipe navigation, task integration, debug panel wiring, mod icon/itempanel workflows, OreDict, aliases, favorites, user/admin settings.
  - Key symbols include `App`, `ItemPanelEntry`, `RecipeType`, `RecipeCraftMode`, `RecipeBindingMode`, `WorkspaceTab`, `LocalDraftPayload`, `DraftGroup`, `ActiveItemInspection`, `buildItemRawValue`, `buildStructuredItemRaw`, `buildNbtRawFromRoot`, `itemPanelRaw`, `itemCatalogEntryToPanelEntry`, `dedupeItemPanelEntries`, `renderItemTooltip`, icon style builders, recipe block collectors, localStorage helpers.
  - Calls most functions through the stable `frontend/src/services/api` barrel.
  - Direct static fetch: `/itempanel.csv`.

### Auth and Server Selection
- `frontend/src/auth/AuthGate.tsx`
  - Loads current user, renders auth/offline states, calls logout.
  - Uses `getCurrentUser`, `getGoogleLoginUrl`, `logoutCurrentUser`.
- `frontend/src/auth/permissions.ts`
  - Frontend role permission helper: `can`.
- `frontend/src/auth/ServerSelect.tsx`
  - Server list/create/rename/delete UI before entering app.
  - Uses `listServers`, `createServer`, `renameServer`, `deleteServer`.

### Shared UI Components
- `frontend/src/components/Panel.tsx`: reusable framed panel component.
- `frontend/src/components/RecipeGrid.tsx`: craft grid rendering/editing, cell icons, atlas parsing, tooltip hooks.
- `frontend/src/components/NbtTreeEditor.tsx`: structured NBT tree editor and node helpers.
- `frontend/src/components/AnimatedIcon.tsx`: animated sprite/icon rendering.
- `frontend/src/components/ActionToolbar.tsx`: compact toolbar.
- `frontend/src/components/StatusBar.tsx`: status item row.
- `frontend/src/components/TabNav.tsx`: tab navigation using shared tab types.

### Mobile Shell Feature
- `frontend/src/features/mobile-shell/MobileAppMenu.tsx`
  - Owns the phone app drawer for workspace navigation, active server/change-server action, language/settings/logout actions, and contextual editor tools.
- `frontend/src/features/mobile-shell/MobileAppMenu.test.tsx`
  - Covers drawer opening, navigation action wiring, server action visibility, and editor tool access.

### Task Feature
- `frontend/src/features/tasks/RecipeTasksBoard.tsx`
  - Admin task board, task forms, drag/reorder/status operations, user/item search, deadline helpers.
  - Uses task API functions and shared `Panel`.
- `frontend/src/features/tasks/taskDefaults.ts`
  - Local task default templates and text expansion.

### Recipe Editor Feature
- `frontend/src/features/recipe-editor/MobileRecipeWorkspace.tsx`
  - Owns the editor workspace shell that keeps desktop columns stable while exposing phone-specific NEI/Favorites tab switching.
- `frontend/src/features/recipe-editor/MobileRecipeWorkspace.test.tsx`
  - Covers recipe file fallback slot and NEI/Favorites tab switching structure.
- `frontend/src/features/recipe-editor/recipeMatrix.ts`
  - Owns recipe matrix cloning, resizing, trimming, source-shape normalization, and craft-mode/recipe-type mapping.
  - Extracted from `pages/App.tsx` so recipe-editor domain logic is no longer owned by the page shell.
- `frontend/src/features/recipe-editor/recipeMatrix.test.ts`
  - Covers matrix edge trimming, strict/shapeless position preservation, supported grid sizing, and recipe type mapping.

### NEI and Favorites Features
- `frontend/src/features/nei/NeiIconItem.tsx`
  - Shared icon-cell component for NEI and favorite items.
  - Owns guarded touch behavior: scroll movement cancels pick, short tap picks, long press opens item inspection, and touch-generated context menus are suppressed so the tooltip action button remains the mobile path to item actions.
- `frontend/src/features/nei-favorites/NeiFavoritesPanel.tsx`
  - Owns NEI favorite tab presentation, browser-style tab switching, `+` tab creation, and hidden `...` settings UI.
  - Receives favorite profile state and persistence callbacks from `pages/App.tsx`.

### Frontend Services and Types
- `frontend/src/services/api/`
  - Modular frontend API client with stable barrel export at `frontend/src/services/api/index.ts`.
  - `client.ts`: shared request wrapper, conflict error, active-server header injection, JSON validation, backend-unavailable messages, blob download filename parsing.
  - `recipes.ts`: parse/create/update/search/save-as recipe endpoints.
  - `settings.ts`: project settings and UI preferences endpoints.
  - `items.ts`: item resolve, custom item, and draft-template endpoints.
  - `itempanel.ts`: item catalog/atlas and itempanel upload/merge endpoints, including static `/itempanel-atlas.json` fallback.
  - `auth.ts`: current user, login/logout, users, roles, access-control endpoints.
  - `tasks.ts`: admin recipe task board endpoints and `RecipeTaskPayload`.
  - `favorites.ts`: NEI favorites endpoints.
  - `modIcons.ts`: mod icon archive/admin/atlas endpoints.
  - `aliases.ts`: item-case alias report/manual/FML-log endpoints.
  - `zsCloud.ts`: cloud `.zs` files and backup endpoints.
  - `oredict.ts`: OreDict upload/list endpoints.
  - `modReplacement.ts`: mod replacement scan/replace endpoints.
  - `servers.ts`: server list/create/rename/delete endpoints and `ServerInfo`.
- `frontend/src/services/debugLog.ts`
  - Frontend console capture and debug event sender.
- `frontend/src/config/runtime.ts`
  - API base resolution, Vite/backend target messages, URL helpers, itempanel fallback env helper.
- `frontend/src/types/index.ts`
  - Shared frontend response/domain types: auth, recipes, resolution, item catalog, atlas, settings, layout, tasks, favorites, users, cloud files, aliases, OreDict.
- `frontend/src/i18n.ts`
  - UI translation tree and helper getters.
- `frontend/src/styles.css`
  - Global app styling.
- `frontend/src/styles/nei.css`
  - NEI/favorites icon-cell, favorite browser tabs, hidden favorite settings menu, and mobile item-inspection presentation.
- `frontend/src/styles/mobile.css`
  - Phone/tablet presentation layer for the main workspace, recipe builder, craft grid, NEI/search panel, touch held-item bar, and modal sizing.
- `frontend/src/styles/mobile-shell.css`
  - Phone app drawer presentation layer for global navigation, server switching, settings, logout, and contextual editor tools.

### Frontend Tests
- `frontend/src/App.test.tsx`: large application workflow coverage.
- `frontend/src/features/nei/NeiIconItem.tsx`: covered through App NEI/favorites interaction tests.
- `frontend/src/features/nei-favorites/NeiFavoritesPanel.tsx`: covered through App favorite-tab and hidden-settings tests.
- `frontend/src/features/mobile-shell/MobileAppMenu.test.tsx`: mobile app drawer behavior.
- `frontend/src/features/recipe-editor/MobileRecipeWorkspace.test.tsx`: mobile recipe workspace shell behavior.
- `frontend/src/features/recipe-editor/recipeMatrix.test.ts`: recipe matrix helper behavior.
- `frontend/src/services/api.test.ts`: API helper behavior.
- `frontend/src/components/AnimatedIcon.test.tsx`: animated icon behavior.

## Frontend API Client Mapping
- `parseText` -> `POST /api/parse`
- `createRecipeTemplate` -> `POST /api/recipes/create`
- `updateRecipe` -> `PUT /api/recipes/{recipe_uid}`
- `searchRecipesByOutput` -> `POST /api/recipes/search`
- `searchRecipesUsingItem` -> `POST /api/recipes/uses`
- `searchRecipesByOutputs` -> `POST /api/recipes/search-batch`
- `saveRecipeAs` -> `POST /api/recipes/save-as`
- `getProjectSettings` -> `GET /api/settings/project`
- `updateProjectSettings` -> `PUT /api/settings/project`
- `updateProjectUiPreferences` -> `PUT /api/settings/project/ui`
- `resolveItemRaw` -> `POST /api/items/resolve`
- `listCustomItems` -> `GET /api/items/custom`
- `saveCustomItem` -> `POST /api/items/custom`
- `deleteCustomItem` -> `DELETE /api/items/custom/{item_id}`
- `listRecipeDraftTemplates` -> `GET /api/recipe-drafts/templates`
- `saveRecipeDraftTemplate` -> `POST /api/recipe-drafts/templates`
- `deleteRecipeDraftTemplate` -> `DELETE /api/recipe-drafts/templates/{draft_id}`
- `getItemPanelAtlas` -> `GET /api/itempanel/atlas`, fallback `/itempanel-atlas.json`
- `getItemCatalog` -> `GET /api/itempanel/catalog`
- `uploadItemPanelCsv` -> `POST /api/admin/itempanel/csv`
- `uploadItemPanelJson` -> `POST /api/admin/itempanel/json`
- `mergeItemPanelFiles` -> `POST /api/admin/itempanel/merge`
- `getItemPanelMergedCsvUrl` -> `GET /api/admin/itempanel/merged`
- `getCurrentUser` -> `GET /api/auth/me`
- `getGoogleLoginUrl` -> `GET /api/auth/google/start`
- `logoutCurrentUser` -> `POST /api/auth/logout`
- `listUsers` -> `GET /api/admin/users`
- `updateUserRole` -> `PATCH /api/admin/users/{user_id}/role`
- `getAccessControlSettings` -> `GET /api/admin/access`
- `updateAccessControlSettings` -> `PUT /api/admin/access`
- `listRecipeTasks` -> `GET /api/admin/tasks`
- `createRecipeTask` -> `POST /api/admin/tasks`
- `updateRecipeTask` -> `PATCH /api/admin/tasks/{task_id}`
- `reorderRecipeTasks` -> `PUT /api/admin/tasks/order`
- `updateRecipeTaskBoardMode` -> `PUT /api/admin/tasks/board`
- `deleteRecipeTask` -> `DELETE /api/admin/tasks/{task_id}`
- `getNeiFavorites` -> `GET /api/nei/favorites`
- `saveNeiFavorites` -> `PUT /api/nei/favorites`
- `getModIconAdminStatus` -> `GET /api/admin/mod-icons`
- `getModIconAtlasManifest` -> `GET /api/mod-icons/atlas`
- `uploadModIconArchive` -> `POST /api/admin/mod-icons/archive`
- `getModIconArchiveDownloadUrl` -> `GET /api/admin/mod-icons/archive`
- `deleteModIconArchive` -> `DELETE /api/admin/mod-icons/archive`
- `cleanModIconArchive` -> `POST /api/admin/mod-icons/archive/clean`
- `generateModIconAtlases` -> `POST /api/admin/mod-icons/generate`
- `getItemCaseAliasReport` -> `GET /api/item-case-aliases`
- `generateItemCaseAliasReport` -> `POST /api/admin/item-case-aliases/generate`
- `saveManualItemCaseAlias` -> `POST /api/admin/item-case-aliases/manual`
- `uploadItemCaseAliasFmlLog` -> `POST /api/admin/item-case-aliases/fml-log`
- `listZsCloudFiles` -> `GET /api/admin/zs-cloud/files`
- `downloadZsCloudFile` -> `GET /api/admin/zs-cloud/files/download`
- `uploadZsCloudFile` -> `POST /api/admin/zs-cloud/files/upload`
- `deleteZsCloudFile` -> `DELETE /api/admin/zs-cloud/files`
- `renameZsCloudFile` -> `PATCH /api/admin/zs-cloud/files/rename`
- `listZsCloudBackups` -> `GET /api/admin/zs-cloud/backups`
- `downloadZsCloudBackup` -> `GET /api/admin/zs-cloud/backups/{backup_id}/download`
- `uploadOreDictFile` -> `POST /api/admin/oredict/upload`
- `getOreDictGroups` -> `GET /api/api/oredict/groups`
- `scanModReplacement` -> `GET /api/admin/mod-replacement/scan`
- `replaceModItems` -> `POST /api/admin/mod-replacement/replace`
- `listServers` -> `GET /api/servers`
- `createServer` -> `POST /api/servers`
- `renameServer` -> `PUT /api/servers/{server_id}`
- `deleteServer` -> `DELETE /api/servers/{server_id}`

## Feature Branches

### Recipe Parse, Edit, Search, Save
- Backend files: `api/routes.py`, `api/schemas.py`, `domain/models.py`, `parsers/recipe_parser.py`, `services/recipe_service.py`, `storage/zs_storage.py`.
- Frontend files: `pages/App.tsx`, `features/recipe-editor/recipeMatrix.ts`, `components/RecipeGrid.tsx`, `components/NbtTreeEditor.tsx`, `services/api/*`, `types/index.ts`.
- APIs: `/parse`, `/recipes/create`, `/recipes/search`, `/recipes/uses`, `/recipes/search-batch`, `/recipes/{recipe_uid}`, `/recipes/save-as`, `/zs/files`, `/zs/files/create`.
- Tests: `test_parser.py`, `test_storage.py`, `test_api_routes.py`, `App.test.tsx`, `recipeMatrix.test.ts`.

### Itempanel, NEI, NBT Catalog
- Backend files: `items/item_catalog.py`, `items/itempanel_merge.py`, `indexer/itempanel_icon_catalog.py`, `services/server_manager.py`, `api/routes.py`.
- Frontend files: `pages/App.tsx`, `features/nei/NeiIconItem.tsx`, `features/nei-favorites/NeiFavoritesPanel.tsx`, `services/api/*`, `components/RecipeGrid.tsx`, `types/index.ts`, `styles/nei.css`, `frontend/public/itempanel.csv`, `frontend/public/itempanel-atlas.json`.
- Data files: root/server `itempanel.csv`, `itempanel.json`, `itempanel_merged.csv`, `itempanel_icons/`, `oredict.txt`.
- APIs: `/itempanel/catalog`, `/itempanel/atlas`, `/itempanel/atlas.png`, `/admin/itempanel/csv`, `/admin/itempanel/json`, `/admin/itempanel/merge`, `/admin/itempanel/merged`.
- Important rule: real NBT comes from `nbt_raw` / `.withTag(...)`, not CSV `Has NBT=true` alone.

### Icon Indexing and Resolver
- Backend files: `indexer/asset_index.py`, `indexer/itempanel_icon_catalog.py`, `resolver/item_resolver.py`, `services/mod_icon_atlas_service.py`, `api/routes.py`.
- Frontend files: `pages/App.tsx`, `components/AnimatedIcon.tsx`, `components/RecipeGrid.tsx`, `services/api/*`.
- Data files: `mods_json/*.json`, `itempanel_icons/`, mod icon ZIP archives, generated atlases.
- APIs: `/index/scan`, `/index/status/{scan_id}`, `/items/resolve`, `/icons/{icon_asset_id:path}`, `/admin/mod-icons*`, `/mod-icons/atlas`, `/mod-icons/atlases/{filename}`.
- Tests: `test_resolver.py`, `test_asset_index_performance.py`, `test_itempanel_icon_catalog.py`, `test_mod_icon_atlas_service.py`, `test_mods_json_manifests.py`.

### Multi-Server Isolation
- Backend files: `services/server_manager.py`, `api/routes.py`, `config/project_config.py`.
- Frontend files: `main.tsx`, `auth/ServerSelect.tsx`, `pages/App.tsx`, `services/api/*`, `types/index.ts`.
- Data files: `.cubixrecipes_admin/servers.json`, `.cubixrecipes_admin/servers/{server_id}/...`, runtime `servers/{server_id}/...`.
- APIs: `/servers`, server-aware regular API via `X-Server-Id` and query fallback.
- Tests: `test_server_manager.py`, `test_api_routes.py`, `App.test.tsx`.

### Auth, Roles, Whitelist
- Backend files: `auth/database.py`, `auth/service.py`, `auth/permissions.py`, `auth/access_control.py`, `api/routes.py`.
- Frontend files: `auth/AuthGate.tsx`, `auth/permissions.ts`, `pages/App.tsx`, `services/api/*`.
- SQL tables: `users`, `custom_items`.
- APIs: `/auth/me`, `/auth/google/start`, `/auth/google/callback`, `/auth/logout`, `/admin/users`, `/admin/access`.
- Tests: `test_auth_permissions.py`, `test_api_routes.py`.

### Admin Tasks
- Backend files: `storage/recipe_tasks.py`, `api/routes.py`, `api/schemas.py`.
- Frontend files: `features/tasks/RecipeTasksBoard.tsx`, `features/tasks/taskDefaults.ts`, `pages/App.tsx`, `services/api/*`, `types/index.ts`.
- Data files: `.cubixrecipes_admin/servers/{server_id}/recipe_tasks.json`.
- APIs: `/admin/tasks`, `/admin/tasks/{task_id}`, `/admin/tasks/order`, `/admin/tasks/board`.

### Draft Templates and Custom Items
- Backend files: `storage/recipe_drafts.py`, `items/custom_items.py`, `api/routes.py`, `api/schemas.py`.
- Frontend files: `pages/App.tsx`, `components/NbtTreeEditor.tsx`, `services/api/*`, `types/index.ts`.
- Data files: `recipe_draft_templates.json`, `custom_items/`.
- APIs: `/recipe-drafts/templates`, `/items/custom`.

### ZS Cloud and Backups
- Backend files: `storage/zs_storage.py`, `storage/zs_cloud.py`, `api/routes.py`.
- Frontend files: `pages/App.tsx`, `services/api/*`, `types/index.ts`.
- Data files: configured `scripts_dir`, `.cubixrecipes_admin/servers/{server_id}/secret_zs_backups/`.
- APIs: `/admin/zs-cloud/files*`, `/admin/zs-cloud/backups*`, `/recipes/save-as`.

### OreDict and Mod Replacement
- Backend files: `items/oredict_parser.py`, `api/routes.py`, `services/item_case_alias_service.py`.
- Frontend files: `pages/App.tsx`, `services/api/*`, `types/index.ts`.
- Data files: `oredict.txt`, uploaded cloud `.zs`, FML logs, alias report files.
- APIs: `/admin/oredict/upload`, `/api/oredict/groups`, `/api/oredict/item/{item_key:path}`, `/admin/mod-replacement/scan`, `/admin/mod-replacement/replace`, `/item-case-aliases`, `/admin/item-case-aliases/*`.

### Debug and Logging
- Backend files: `debug/models.py`, `debug/debug_service.py`, `debug/log_service.py`, `api/routes.py`.
- Frontend files: `services/debugLog.ts`, `pages/App.tsx`.
- APIs: `/debug/config`, `/debug/recipes`, `/debug/assets`, `/debug/resolver`, `/debug/parse`, `/debug/summary`, `/debug/log*`, `/debug/clear`.

### Admin Desktop Shell
- Root files: `admin_panel.py`, `start-dev.py`, `CubixRecipes_Admin.spec`.
- Responsibilities: start/stop backend/frontend, display consoles/status, rebuild itempanel atlas, package admin executable.
- Related script: `backend/scripts/generate_itempanel_atlas.py`.

## Dependency Graph

### Backend Import Direction
- `api/routes.py` -> schemas, auth, config, debug, domain, indexer, items, parser, resolver, services, storage.
- `services/server_manager.py` -> config, storage, indexer, items, resolver, drafts/tasks/favorites/custom items, aliases, backups, mod icons.
- `services/recipe_service.py` -> domain, parser, storage.
- `storage/zs_storage.py` -> domain, parser.
- `parsers/recipe_parser.py` -> domain.
- `items/item_catalog.py` -> domain, itempanel icon catalog, itempanel merge, oredict parser.
- `resolver/item_resolver.py` -> domain, asset index, itempanel icon catalog.
- `debug/debug_service.py` -> config, debug models, domain.
- `auth/service.py` -> auth database, auth permissions.
- `auth/access_control.py` -> auth permissions.
- `storage/recipe_tasks.py`, `storage/recipe_drafts.py`, `storage/nei_favorites.py`, `items/custom_items.py` -> auth permissions.

### Frontend Import Direction
- `main.tsx` -> `pages/App`, auth gate, server select, debug log, types.
- `pages/App.tsx` -> shared components, tasks feature, runtime config, i18n, API client, debug log, auth permissions, types.
- `pages/App.tsx` -> `features/recipe-editor/recipeMatrix` for recipe matrix source-shaping helpers.
- `main.tsx` -> `styles.css`, `styles/nei.css`, `styles/mobile.css`, `styles/mobile-shell.css`.
- `features/tasks/RecipeTasksBoard.tsx` -> `Panel`, API client, types, task defaults.
- `services/api/index.ts` -> API domain modules.
- `services/api/client.ts` -> runtime config, debug log.
- `services/api/*` domain modules -> `services/api/client.ts`, shared frontend types where needed.
- `components/RecipeGrid.tsx` -> `AnimatedIcon`, types.
- `components/TabNav.tsx` -> types.
- `auth/AuthGate.tsx` -> API client, types.
- `auth/ServerSelect.tsx` -> API client, types.

## Known Structural Risks
- `backend/app/api/routes.py` is a large orchestration file and is the Stage 4 modularization target.
- `frontend/src/pages/App.tsx` is very large and is the Stage 5 modularization target.
- Normal application files should stay under the 500-line hard limit from `AGENTS.md`; existing oversized files are technical debt and should not receive new feature logic without extracting the touched concern. Mobile presentation now belongs in `frontend/src/styles/mobile.css` rather than growing `frontend/src/styles.css`.
- Current file-size guard hotspots also include `frontend/src/App.test.tsx`, `frontend/src/styles.css`, `frontend/src/features/tasks/RecipeTasksBoard.tsx`, `backend/app/tests/test_api_routes.py`, `start-dev.py`, and `admin_panel.py`.
- Static frontend itempanel files and localStorage can mask backend itempanel uploads; check loader/cache path before changing catalog behavior.
- Full backend pytest may be blocked in this environment when dependencies such as `pytest` or `fastapi` are missing; prefer focused tests for touched modules plus frontend test/build when relevant.
- `recipe_db_path` exists in config validation but is currently marked unused by backend.
