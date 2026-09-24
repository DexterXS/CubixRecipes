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
  - `.cubixrecipes_admin/servers/{server_id}/itempanel/item_catalog_cache.json`: fingerprinted serialized item catalog cache; rebuilt atomically when catalog inputs change.
  - `.cubixrecipes_admin/servers/{server_id}/itempanel_icons/`: per-server itempanel icon source.
  - `.cubixrecipes_admin/servers/{server_id}/itempanel_atlas_cache/`: generated itempanel atlas PNG/manifest cache for the server source snapshot.
  - `.cubixrecipes_admin/servers/{server_id}/recipe_draft_templates.json`: shared/admin recipe draft templates.
  - `.cubixrecipes_admin/servers/{server_id}/recipe_draft_preferences.json`: per-user draft sort/group preferences keyed by normalized email.
  - `.cubixrecipes_admin/servers/{server_id}/recipe_tasks.json`: admin task board.
  - `/data/.cubixrecipes_admin/servers/{server_id}/auction_planner.json` when backend data-dir is configured, otherwise `.cubixrecipes_admin/servers/{server_id}/auction_planner.json`: per-server Auctions day-folder planner state, including folders, lots, selected IDs, UI mode, workflow mode, command stage, saved command-generator modes with per-command enabled/disabled flags, and the persistent lot database under `lotLibrary`.
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
  - Key classes: `ParseRequest`, `SearchRequest`, `IngredientSearchRequest`, `BatchSearchRequest`, `CreateRecipeRequest`, `SaveAsRequest`, `UpdateRecipeRequest`, `ResolveRequest`, `CustomItemRequest`, `RecipeDraftTemplateRequest`, `RecipeTask*Request`, `Nei*Request`, `ProjectSettingsRequest`, `IconSurfaceRequest`, `RoleUpdateRequest`, `AccessControlRequest`, `DebugLogEventRequest`, `ModReplacementRequest`.

### Domain
- `backend/app/domain/models.py`
  - Shared backend domain objects.
  - Classes/enums: `MetaMode`, `BindingMode`, `ItemRef`, `RecipeCell`, `RecipeSource`, `Recipe`, `ResolutionResult`, `AssetCandidate`.
  - `ItemRef.modid/name/base_key` remain lowercase normalized lookup data; `canonical_modid/canonical_name/canonical_key` preserve source registry spelling for serialization.
  - Used by parser, storage, resolver, item catalog, debug, and recipe service.

### Config
- `backend/app/config/project_config.py`
  - Project paths, UI preferences, data-dir defaults, validation, runtime directory creation.
  - Classes: `PanelLayoutItemConfig`, `WorkspaceLayoutConfig`, `UiPreferencesConfig`, `ProjectPathsConfig`, `ProjectConfigService`.
  - Reads/writes config JSON; builds recipe scan paths and icon index paths; normalizes persisted desktop/mobile UI icon surface settings under `ui_preferences.icon_surfaces` and `ui_preferences.mobile_icon_surfaces`.
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
  - Builds backend item catalog from itempanel CSV, SNBT, icon availability, OreDict; persists a fingerprinted per-server cache so unchanged startup sources reuse serialized entries and exposes the current source fingerprint for lightweight reload checks.
  - `ItemCatalogEntry.key` is the lowercase lookup key while `canonical_key` and `raw` retain itempanel registry spelling; cache version 3 invalidates older entries with the previous lowercase serialization semantics.
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
- `backend/app/indexer/itempanel_atlas_builder.py` and `backend/app/indexer/itempanel_atlas_cache.py`
  - Build and persist one server-scoped itempanel atlas/manifest keyed by source fingerprint so requests reuse generated bytes.
- `backend/app/resolver/item_resolver.py`
  - Resolves `ItemRef` to icon/name/confidence through itempanel catalog, manual overrides, model texture links, lang lookup, grouped candidates, meta-specific strategies, and fallback asset paths.
  - Class: `ItemResolver`.
  - Depends on `AssetIndex`, `ItemPanelIconCatalog`, and domain models.
- `backend/app/services/mod_icon_atlas_service.py`
  - Uploads/validates/cleans mod icon ZIP archives and packs generated per-size shared atlas pages.
  - Publishes a revisioned manifest and versioned URLs for every generated page so x32/x256 multi-page atlases can be cached safely; frontend page bytes are loaded lazily.
  - Classes: `ArchiveAlreadyExistsError`, `ArchiveNotFoundError`, `InvalidModIconArchiveError`, `ModIconSource`, `ModIconAtlasService`.
- `backend/app/services/mod_icon_atlas_build_job.py`
  - Runs ZIP/mod-icon atlas packing outside the HTTP request and exposes queued/building/ready/error status; ready completion starts the Atlas v2 rebuild.
- `backend/app/atlas/registry.py`
  - Builds the single backend ZIP-to-item registry used by Atlas v2 revisions; matches catalog raws to all available x32/x256 ZIP entries and reports mapped/unmapped counts.
- `backend/app/atlas/artifact_store.py` and `backend/app/atlas/revision_service.py`
  - Store per-server immutable Atlas v2 revisions, atomically publish the active revision pointer, and build combined primary/ZIP page snapshots in a daemon background worker; revision indexes include the unified registry candidates and mapping statistics.
  - `AtlasArtifactStore` owns safe revision/artifact paths, atomic JSON/PNG writes, and guarded pruning; `AtlasRevisionService` owns build status, active revision reads, candidate/page snapshots, explicit activation, and prune orchestration.
  - Revision data lives under `.cubixrecipes_admin/servers/{server_id}/atlas/` and does not replace legacy itempanel/mod-atlas storage.

### Server and Admin State
- `backend/app/services/server_manager.py`
  - Multi-server isolation layer.
  - Classes: `ServerManager`, `ServerContext`.
  - Creates per-server config, storage, item catalogs, icon catalogs, resolver, drafts, tasks, favorites, custom items, case aliases, cloud backup service, and mod icon service.
  - Migrates legacy global data into default `hitech` server context.
- `backend/app/storage/recipe_tasks.py`
  - JSON-backed admin task board.
  - Class: `RecipeTaskStore`.
- `backend/app/storage/auction_planner.py`
  - JSON-backed per-server Auctions planner state for frontend day folders and lots.
  - Class: `AuctionPlannerStore`.
  - Persists under the backend data-root (`/data/.cubixrecipes_admin/servers/{server_id}/auction_planner.json` on Railway/data-volume setups), bounds nested folder/lot/item lists plus the persistent lot database, dynamic command-generation profile modes, editable command templates, player target, status filters, per-command enabled flags, and per-mode generation order (`grouped` or `perLot`), and keeps the full local planner state across page reloads and deploys.
- `backend/app/storage/recipe_drafts.py`
  - JSON-backed shared/admin draft templates.
  - Class: `RecipeDraftTemplateStore`.
- `backend/app/storage/recipe_draft_preferences.py`
  - Atomic JSON-backed per-user recipe-draft sort/group preferences.
  - Class: `RecipeDraftPreferencesStore`.
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
- `backend/app/tests/test_atlas_registry.py`: ZIP x32/x256 to catalog-raw mapping and registry completeness statistics.
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
- `GET /api/admin/auction-planner`
- `PUT /api/admin/auction-planner`
- `GET /api/nei/favorites`
- `PUT /api/nei/favorites`

### Itempanel, OreDict, Mod Icons, Aliases
- `POST /api/admin/itempanel/csv`
- `POST /api/admin/itempanel/json`
- `POST /api/admin/itempanel/merge`
- `GET /api/admin/itempanel/merged`
- `GET /api/itempanel/catalog`
- `GET /api/itempanel/catalog/version`
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
- `GET /api/admin/mod-icons/generate/status`
- `GET /api/admin/mod-icons/atlases/{filename}`
- `GET /api/mod-icons/atlas`
- `GET /api/mod-icons/atlases/{filename}`
- `POST /api/admin/atlas/v2/revisions/build`
- `GET /api/atlas/v2/meta`
- `GET /api/atlas/v2/index`
- `GET /api/atlas/v2/candidates/{raw:path}`
- `GET /api/atlas/v2/pages/{page}`
- `GET /api/atlas/v2/revisions`
- `POST /api/atlas/v2/revisions/{revision}/activate`
- `POST /api/admin/atlas/v2/revisions/prune`
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
- `GET /api/recipe-drafts/preferences`
- `PUT /api/recipe-drafts/preferences` (requires `templates:create`)
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
- `frontend/src/app/workspaceNavigation.ts`
  - App-shell owner for top-level workspace tab IDs, product-oriented labels, section areas, descriptions, and permission-based visibility.
  - Exports shared `WorkspaceTab` so the page shell and navigation components do not redefine the workspace-tab contract.
- `frontend/src/app/AppWorkspaceNav.tsx`
  - Desktop workspace navigation component for the global product sections currently backed by existing workspaces: recipes, drafts, tasks, files, and tech.
  - Preserves `workspace-tab-*` test IDs for existing workflow tests.
- `frontend/src/app/ServerContextChip.tsx`
  - Global active-server chip in the app shell, including the quick change-server action.
  - Keeps server context visible outside recipe-specific UI.
- `frontend/src/pages/App.tsx`
  - Central SPA workflow module and current biggest frontend file.
  - Owns editor state, NEI/itempanel loading, local draft caches, cloud `.zs` operations, admin technical panel, item/NBT editor state, recipe navigation, craft-board menu settings, task integration, debug panel wiring, mod icon/itempanel workflows, OreDict, aliases, favorites, user/admin settings, and thin integration for extracted app-shell navigation and icon-surface settings.
  - Integrates `CraftsWorkspace` for the five-zone editor screen and keeps `DraftsWorkspace` available as the transition-period standalone Черновики tab.
  - Owns account-scoped draft preference hydration/autosave and the temporary suppression of integrated draft panels when opening a draft directly from the standalone tab.
  - Loads cached/bundled itempanel entries immediately; the backend catalog is a background refresh rather than a prerequisite for rendering NEI cells. The browser item catalog snapshot uses an explicit schema version so pre-canonical cached raws are ignored after this migration.
  - Key symbols include `App`, `ItemPanelEntry`, `RecipeType`, `RecipeCraftMode`, `RecipeBindingMode`, `WorkspaceTab`, `LocalDraftPayload`, `DraftGroup`, `ActiveItemInspection`, `buildItemRawValue`, `buildStructuredItemRaw`, `buildNbtRawFromRoot`, `itemPanelRaw`, `itemCatalogEntryToPanelEntry`, `dedupeItemPanelEntries`, `renderItemTooltip`, icon style builders, recipe block collectors, localStorage helpers.
  - Calls most functions through the stable `frontend/src/services/api` barrel.
  - Direct static fetch: `/itempanel.csv`.
  - Uses the shared Atlas v2 lookup for NEI, recipe, draft, suggestion, and held-item rendering; legacy endpoint/cache shapes remain adapters at the page boundary.

- `frontend/src/features/icon-settings/`
  - Shared icon-surface registry, desktop/mobile defaults, CSS variable builder, local trigger/host wiring, and the modal settings controller used by NEI, favorites, drafts, crafting, tasks, Auctions, and CubixCraft.
  - `IconSurfaceSettingsContext.tsx` owns one active live draft, saved snapshot, explicit global save, cancel/close rollback, profile/surface reset, retryable save errors, and mobile profile selection.
  - `IconSurfaceSettingsPopover.tsx` is the keyboard-accessible native modal/bottom sheet with advanced controls for cell/icon size, gaps, padding, border, sprite scale, offsets, overflow, smoothing, and grid grouping; the shared window has a transparent backdrop, pointer-drag header, viewport bounds, and native resize support.
  - `draftTemplateIcon` is the dedicated surface for each recipe icon in the drafts list; it is distinct from the larger selected-draft and recipe-preview surfaces.
  - `iconSurfaces.ts` normalizes legacy four-field settings into the additive extended contract and publishes per-surface CSS variables consumed by `styles/icon-placement.css` and `IconSurfaceSettings.css`.

- `frontend/src/services/atlas/`
  - Shared frontend Atlas v2 foundation used by the main app, CubixCraft, and the item database.
  - `types.ts`: candidate quality/source/surface contracts, registry completeness statistics, and lookup inputs.
  - `candidateSelector.ts`: deterministic quality, match, source, size, and revision ordering; invalid candidates never render.
  - `atlasLookup.ts`: normalizes active Atlas v2 primary/registry candidates, legacy itempanel, ZIP, and direct fallback candidates into O(1) raw/key indexes and produces atlas CSS styles; activates legacy ZIP matching only when the backend registry is incomplete.
  - `modIconMatching.ts`: compatibility fallback that maps available x32/x256 ZIP entries to catalog raws when an older/incomplete backend registry is served.
  - `atlasPageUrlResolver.ts`: shared server-aware immutable atlas URL normalization.
  - `candidateSelector.test.ts`: focused quality/source/size, multi-source, and Atlas v2 page URL coverage.

### Auth and Server Selection
- `frontend/src/auth/AuthGate.tsx`
  - Loads current user, hydrates the last confirmed session from session storage during F5 reloads, renders auth/offline states, and calls logout.
  - Uses `getCurrentUser`, `getGoogleLoginUrl`, `logoutCurrentUser`.
- `frontend/src/services/bootstrapCache.ts`
  - Stores server-and-user scoped bootstrap snapshots for critical startup data; restores NEI favorites synchronously and keeps the full NEI item catalog in localStorage when possible plus IndexedDB for large-catalog hydration.
  - Owns cache schema validation and never stores authentication secrets.
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
- `frontend/src/features/recipe-editor/CraftsWorkspace.tsx`
  - Owns the fixed desktop five-zone composition: NEI favorites, editor/files, compact NEI, all drafts, and editable previews for recipes of the selected draft.
  - Renders three independent desktop columns (favorites plus drafts, editor plus files, NEI plus selected-draft recipes) so side-panel heights do not share a CSS grid row.
  - The desktop composition styling lives in `frontend/src/styles.css`: side regions use content-sized auto rows and capped fit-content columns, while the center uses content-sized editor/files rows to avoid artificial bottom whitespace.
- `frontend/src/features/recipe-editor/MobileRecipeWorkspace.tsx`
  - Owns the editor workspace shell that keeps desktop columns stable while exposing phone-specific NEI/Favorites tab switching.
- `frontend/src/features/recipe-editor/MobileRecipeWorkspace.test.tsx`
  - Covers recipe file fallback slot and NEI/Favorites tab switching structure.
- `frontend/src/features/recipe-editor/recipeMatrix.ts`
  - Owns recipe matrix cloning, resizing, trimming, source-shape normalization, and craft-mode/recipe-type mapping.
  - Extracted from `pages/App.tsx` so recipe-editor domain logic is no longer owned by the page shell.
- `frontend/src/features/recipe-editor/recipeMatrix.test.ts`
  - Covers matrix edge trimming, strict/shapeless position preservation, supported grid sizing, and recipe type mapping.

### Icon Lab Feature
- `frontend/src/features/icon-lab/IconScaleLab.tsx`
  - Temporary technical-panel lab for comparing 64 small-cell icon sizing and centering variants against the current real item icon.
- `frontend/src/features/icon-lab/IconScaleLab.css`
  - Scoped presentation for the icon lab preview grid and per-variant scaling/centering modes.

### Diagnostics Feature
- `frontend/src/features/diagnostics/TechnicalPanelShell.tsx`
  - Owns the technical panel shell, sidebar navigation, diagnostics section IDs, visible section rendering, and wipe-update sidebar action.
  - Receives active section state and rendered section content from `pages/App.tsx`; section content still lives in the page shell until later diagnostics splits.
- `frontend/src/features/diagnostics/DebugEventsList.tsx`
  - Owns technical-panel debug event list rendering and the shared debug event/category/level types used by `pages/App.tsx`.
  - Receives filtered event data and category labels from `pages/App.tsx`.
- `frontend/src/features/diagnostics/DiagnosticsLogsPanel.tsx`
  - Owns the technical-panel logs section presentation: category filters, level filters, event count, and `DebugEventsList` composition.
  - Receives debug filter state and callbacks from `pages/App.tsx`.
- `frontend/src/features/diagnostics/DiagnosticsRuntimePanel.tsx`
  - Owns the technical-panel runtime section presentation for UI state, backend/loading state, and computed action availability.
  - Receives runtime values from `pages/App.tsx`.
- `frontend/src/features/diagnostics/DiagnosticsOverviewPanel.tsx`
  - Owns the technical-panel overview section presentation for status, current recipe diagnostics, and quick debug values.
  - Receives computed status and recipe state from `pages/App.tsx`.
- `frontend/src/features/diagnostics/DiagnosticsRecipePanel.tsx`
  - Owns the technical-panel recipe diagnostics section presentation for grid state, output status, and output icon display slot.
  - Receives computed recipe values and a pre-rendered output icon from `pages/App.tsx`.
- `frontend/src/features/diagnostics/DiagnosticsAccessPanel.tsx`
  - Owns the technical-panel access section layout for personnel roles, whitelist, and static role permission reference.
  - Receives role-management and whitelist content from `pages/App.tsx`.
- `frontend/src/features/diagnostics/DiagnosticsModIconsPanel.tsx`
  - Owns the technical-panel mod icon archive upload/status UI and generated atlas preview grid.
  - Receives mod-icon archive actions, status, manifest data, and image URL normalization from `pages/App.tsx`; API orchestration remains in the page shell until a later diagnostics service split.
- `frontend/src/features/diagnostics/ModReplacementPanel.tsx`
  - Owns the technical-panel mod replacement UI for choosing a source mod, mapping recipe items to replacements, and embedding the NEI picker column.
  - Receives scan/replace state, item icon renderers, and callbacks from `pages/App.tsx`; scanning and persistence remain in the page shell until a later state/service split.
- `frontend/src/features/diagnostics/ItemCaseAliasPanel.tsx`
  - Owns the technical-panel item case-alias report UI: generation controls, FML log upload, manual alias form, alias table, and missing itempanel list.
  - Receives report data and persistence callbacks from `pages/App.tsx`; report API orchestration remains in the page shell until a later diagnostics service split.

### Item Catalog Feature
- `frontend/src/features/item-catalog/ItemTextureToolsPanel.tsx`
  - Owns the itempanel texture/icon cache panel presentation: mod selection, load/pause/resume/cancel controls, status text, and selected-mod progress summaries.
  - Receives texture loading state and callbacks from `pages/App.tsx`; item catalog loading and localStorage cache ownership remain in the page shell until a later item-catalog state split.

### Icon Settings Feature
- `frontend/src/features/icon-settings/iconSurfaces.ts`
  - Registry and normalization owner for all configurable icon surfaces: NEI, favorites, draft items, craft grids, outputs, draft previews, tasks, Auctions preview/lot/NEI surfaces, held item, and mobile inspection.
  - Builds shared CSS custom properties, desktop/mobile default profiles, dynamic craft-grid fitting from viewport size, and real per-surface placement variables for grid/absolute/wrapper/scale modes.
- `frontend/src/features/icon-settings/iconSurfaces.test.ts`
  - Covers centered scale placement, normal grid/wrapper flow, and placement-variable publication for the configured surface registry.
- `frontend/src/features/icon-settings/useIconViewport.ts`
  - React hook owner for viewport tracking, mobile profile selection, and icon-surface CSS variable generation.
- `frontend/src/features/icon-settings/IconSettingsPanel.tsx`
  - Admin technical-panel UI for desktop/mobile profile switching, live icon-size previews, sliders, center-mode toggles, and reset controls.
  - On phone-width viewports, `pages/App.tsx` opens this panel on the mobile icon profile so preview values match the active runtime CSS profile.
- `frontend/src/features/icon-settings/IconSettingsPanel.css`
  - Scoped presentation for icon settings cards, previews, sliders, and center-mode controls.
  - Center-mode controls wrap inside each card so the technical panel remains readable at three-column desktop widths.

### Settings Feature
- `frontend/src/features/settings/AppSettingsModal.tsx`
  - Owns the global settings modal presentation for UI scale, NEI page size, shared craft draft mode, hotkey debug filters, and NEI favorite/filter preferences.
  - Receives state and persistence callbacks from `pages/App.tsx`; persistence still belongs to the page shell until settings state is split further.

### Auctions Feature
- `frontend/src/features/auctions/AuctionBuilder.tsx`
  - Coordinates the local auction command planner state and actions for the folder list, opened folder, opened auction lot, graph workspace, and persistent lot database. Owns ribbon state, selected folder, selected auction, command-stage state, item picking state, status bar context, persistence wiring, full-folder command generation, per-lot command-generator scoping, and extensionless command-file download modal.
  - Uses `AuctionDayFolder` state instead of a flat top-level auction array; selected-folder auctions are passed to existing command generation so `/aca` behavior remains stable.
  - Receives item catalog options and icon renderer from `pages/App.tsx`.
- `frontend/src/features/auctions/AuctionWorkspaceView.tsx`
  - Owns central Auctions view composition and routing between opened lot, global graph workspace, opened-folder contents, folder grid with the left lot database, selected-folder details, and the selected-lot quick settings panel. It receives state/actions from `AuctionBuilder.tsx` and does not own command generation or persistence.
- `frontend/src/features/auctions/useAuctionPlannerPersistence.ts`
  - Owns Auctions planner load/autosave against `/api/admin/auction-planner`, including preserving saved command profiles and the persistent lot database when remote folders are empty so deploy/reload does not overwrite modes or detached lots with defaults.
  - Normalizes older saved planner payloads so missing `baseStartPrice`, folder `state`, graph curve, and folder defaults do not break after deploys.
  - Provides immediate save for explicit lot apply actions and periodically refreshes newer server planner state when the local tab has no unsaved edits. Command generation profiles are saved in the same backend data file.
- `frontend/src/features/auctions/auctionLotItems.ts`
  - Owns lot item ordering helpers and the rule that only the first item title drives the auction name.
- `frontend/src/features/auctions/auctionLotLibrary.ts`
  - Owns the persistent Auctions lot database model helpers: deduplicating equivalent lots across folders, auto-cleaning old description-edit clones by stable lot identity while keeping the newest record, updating existing folder records by `auction.id` during edits, keeping detached records after folders are deleted, filtering/searching records, creating unattached lots, deleting database records, and copying a database lot into a target day folder.
- `frontend/src/features/auctions/useAuctionLotLibraryState.ts`
  - Owns frontend state/actions for the lot database: syncing current folder lots into `lotLibrary`, creating detached lots, deleting database records, opening the first live attached lot, and handling drag/drop from the database into a folder.
- `frontend/src/features/auctions/auctionDayFolders.ts`
  - Owns day-folder domain helpers for the frontend Auctions workspace: creating initial folders and drafts, regular/planned folder categories, copying days while clearing server IDs, applying folder defaults, summarizing folder prices/items/currencies/ID/NBT warnings, planned-folder fixed-price graph isolation, duration-unit conversion, compact duration display, and date/time helpers. Folder currency is a default for new lots; actual lot currencies can be mixed. Folder state controls auction states; lot start price belongs to the auction draft, not individual item rows; new lots default to generating `addItem` commands until the per-lot toggle is disabled.
- `frontend/src/features/auctions/AuctionRibbon.tsx`
  - Owns the Word/Excel-style ribbon shell for the Auctions workspace. Each top tab renders only its matching groups: home creation/work checks, auction day parameters with duration picker plus timezone/start/end time controls, item/lot actions, simplified command generation/download actions, graphs/prices, tools/planner, and view mode. Day deletion and the Commands tab are shown only while the folder grid is visible.
- `frontend/src/features/auctions/AuctionDurationPicker.tsx`
  - Owns the ribbon duration popover for day/hour/minute selection. It stores the planner value as minutes while presenting a compact unit-aware selector that stays synced with the end-time control.
- `frontend/src/features/auctions/auctionCommandProfile.ts`
  - Owns command-generation profile normalization, status filtering, player target handling, legacy block-profile migration, strict enabled-flag normalization for saved checkboxes, dynamic create/rename/delete modes, empty-mode-list support, per-mode grouped/per-lot command assembly, per-lot `addItem` skipping, and dropping removed command templates before preview/download.
- `frontend/src/features/auctions/auctionCommandDefinitions.ts`
  - Owns command-generation labels, built-in editable command templates, default install/existing mode presets, scope labels, compact English status labels, and grouped/per-lot order labels shared by profile normalization and the generator modal. `/give` is not a built-in template; add it as a custom command when needed.
- `frontend/src/features/auctions/AuctionCommandGeneratorModal.tsx`
  - Owns the command generation menu opened from the ribbon: selected custom mode, mode create/rename/delete actions, grouped/per-lot order toggle, colored multi-status filter chips, player/nick input, editable command templates, enabled command order, custom commands, generated preview, variable-help toggle, profile save, and direct download.
- `frontend/src/features/auctions/AuctionCommandVariablesHelp.tsx`
  - Owns the command-generator help panel listing supported template variables, their meanings, and example values.
- `frontend/src/features/auctions/AuctionDayFolderGrid.tsx`
  - Owns the central day-folder card grid. Cards select folders without opening them, accept lot-database drops, show regular blue vs planned purple categories, use a neon folder-shaped shell with distinct selected/normal states, preview one item from up to five lots, show start date, compact day/hour/minute duration, item count, price range, price mode, actual lot currency summary, folder state, missing-ID/NBT indicators, and quick open/copy actions.
- `frontend/src/features/auctions/AuctionLotLibraryPanel.tsx`
  - Owns the left-side lot database UI shown with the folder grid: collapsed/open state, 4x16 icon grid paging, search, currency-colored borders, hover detail tooltip, detached-date labels, detached lot creation, right-click deletion context menu, and drag payload creation for dropping lots into any visible folder.
- `frontend/src/features/auctions/AuctionDayContentsPanel.tsx`
  - Owns the opened folder view: breadcrumb back to the folder list, auction lot cards inside the selected folder, selected-auction switching, lot preview item, start price/step/status/server-ID metrics, add/open/copy/delete actions, and command-stage shortcuts for a specific auction.
- `frontend/src/features/auctions/AuctionDayDetailsPanel.tsx`
  - Owns the selected-folder right panel. It manages folder-level actions and fields only: open/copy/delete folder, regular/planned category, regular folder date, planned repeat settings, currency/duration/step/state, price mode, statistics, server-ID status, graph applicability, and expert-only folder metadata.
- `frontend/src/features/auctions/AuctionLotQuickPanel.tsx`
  - Owns the selected-lot quick settings panel shown beside the opened-folder lot list: lot name, description, currency, prices, duration, state, primary server ID, per-lot `Добавить предмет` command toggle, command shortcut, full-lot open action, and explicit apply/save.
- `frontend/src/features/auctions/AuctionLotWorkspace.tsx`
  - Owns the opened auction lot screen: breadcrumb, read-only lot preview, item list with quantity/order/NBT controls, simplified apply/cancel action row, auction command-control panel without state or start/end date editing, editable whole-lot start price, and NEI catalog for adding items to the current lot.
  - Its scoped CSS keeps the opened-lot NEI picker on exact square cells from `--icon-auction-nei-cell` with zero button padding; do not stretch those columns with `1fr`, or the runtime grid will drift from the icon-settings preview.
- `frontend/src/features/auctions/AuctionDownloadModal.tsx`
  - Owns the extensionless auction command-file download dialog.
- `frontend/src/features/auctions/AuctionStatusBar.tsx`
  - Owns the context status row for folder list, opened folder, and opened lot views. It shows only useful counts such as folder totals, planned/regular counts, item counts, missing IDs, and warnings.
- `frontend/src/features/auctions/AuctionPriceModePanel.tsx`
  - Owns the selected-day price-mode panel and lightweight manual price preview without loading the graph.
- `frontend/src/features/auctions/AuctionServerIdPanel.tsx`
  - Owns selected-day server-ID lifecycle messaging and missing-ID summary.
- `frontend/src/features/auctions/AuctionPlanPanel.tsx`
  - Legacy auction plan sidebar retained for compatibility/reference but no longer used by the main day-folder workspace.
- `frontend/src/features/auctions/AuctionItemsWorkspace.tsx`
  - Legacy auction item workspace retained for compatibility/reference but no longer used by the main three-level Auctions workspace.
- `frontend/src/features/auctions/AuctionHelpTip.tsx`
  - Owns local hover/focus help popovers for auction-only fields and panels, including examples for local labels, server IDs, graph percentages, item prices, and staged command downloads.
- `frontend/src/features/auctions/auctionCommands.ts`
  - Owns deterministic low-level auction command/date/price helpers and legacy staged command generation for workspace panels. User-selectable per-command template assembly, status filtering, and custom command rendering live in `auctionCommandProfile.ts`.
  - Formats configured timezone values into UTC+0 `dd.MM.yyyy_HH:mm`, strips filename extensions, applies 90-day percentage curves to whole-lot start prices by calendar-day graph index, exposes shared run-price previews for the UI, uses only entered server IDs for ID-dependent commands, skips `addItem` for lots with the per-lot toggle off, and excludes NBT items from generated commands.
- `frontend/src/features/auctions/AuctionGraphPanel.tsx`
  - Also owns the wipe-start date control and approximate wipe-end window shown above the graph.
  - Owns the graph panel inside the `Графики` ribbon tab, including currency tabs, the all-currencies overlay, point context menus, opening/editing auctions from graph points, point dragging for graph day/percentage edits, same-day conflict blocking by folder category and currency, duplicating a single auction into a new folder, folder tag assignment, and selected graph series wiring across all auction folders.
- `frontend/src/features/auctions/AuctionGraphsWorkspace.tsx`
  - Owns the dedicated global graph workspace that wraps `AuctionGraphPanel` with graph-wide folder totals, regular/planned counts, missing server-ID/NBT status, and a sorted folder queue. It is the graph-tab screen owner; the selected-day details panel is not rendered in this mode.
- `frontend/src/features/auctions/auctionFolderTags.ts`
  - Owns the one-tag-per-folder color palette used by folder cards, folder details, and graph point tinting.
- `frontend/src/features/auctions/auctionGraphModel.ts`
  - Also aggregates per-point auction duration spans for graph occupancy rendering.
  - Owns graph point aggregation across day folders: regular folders produce editable graph points, planned purple folders produce static points, folder tags flow into point colors, actual lot currencies drive placement conflicts, and horizontal point movement shifts editable regular auctions by whole days while preserving local time and blocking same-category/same-currency day conflicts.
- `frontend/src/features/auctions/AuctionPriceGraph.tsx`
  - Also renders three calendar zones, date-range x-axis labels, and duration occupancy lines.
  - Owns the draggable multi-currency 90-day SVG graph, including hover date titles, right-click point opening, static planned-folder points, and pointer dragging that changes percentage vertically and day horizontally through a local preview with pointer grab-offset preservation; release commits the last visible preview state, while expensive app state and placement checks run once on pointerup.
- `frontend/src/features/auctions/AuctionRunPricePreviewList.tsx`
  - Owns the immediate price preview under the auction graph, showing each auction run/repeat date, graph multiplier, start price, and bid step using the same calculation as command generation.
- `frontend/src/features/auctions/AuctionBuilder.css`
  - Scoped presentation for the auction builder workspace shell, item picker, and warnings. The old permanent lower editor/command-preview area is not part of the current Auctions screen.
- `frontend/src/features/auctions/AuctionGraphPanel.css`
  - Scoped presentation for the graph workspace, draggable graph SVG, and run-price preview list.

### NEI and Favorites Features
- `frontend/src/features/nei/NeiIconItem.tsx`
  - Shared icon-cell component for NEI and favorite items.
  - Owns guarded touch behavior: scroll movement cancels pick, short tap picks, long press opens item inspection, and touch-generated context menus are suppressed so the tooltip action button remains the mobile path to item actions.
- `frontend/src/pages/App.tsx`
  - Owns the NEI item action menu callbacks, including mobile `...` actions for opening the item recipe and viewing recipe usages.
- `frontend/src/features/nei-favorites/NeiFavoritesPanel.tsx`
  - Owns icon-only NEI favorite tab presentation, browser-style tab switching, `+` tab creation, and hidden `...` settings UI; icon assignment is explicit and supports chooser or drag/drop from NEI.
  - Receives favorite profile state and persistence callbacks from `pages/App.tsx`.

### Frontend Services and Types
- `frontend/src/utils/formatFileSize.ts`
  - Shared frontend file-size formatter used by admin/cloud/mod-icon presentation components.
- `frontend/src/services/api/`
  - Modular frontend API client with stable barrel export at `frontend/src/services/api/index.ts`.
  - `client.ts`: shared request wrapper, conflict error, active-server header injection, JSON validation, backend-unavailable messages, blob download filename parsing.
  - `recipes.ts`: parse/create/update/search/save-as recipe endpoints.
  - `settings.ts`: project settings and UI preferences endpoints.
  - `items.ts`: item resolve, custom item, and draft-template endpoints.
  - `itempanel.ts`: item catalog/atlas and itempanel upload/merge endpoints, including static `/itempanel-atlas.json` fallback.
  - `atlas.ts`: active Atlas v2 index endpoint with server-scoped no-store refresh.
  - `auth.ts`: current user, login/logout, users, roles, access-control endpoints.
  - `tasks.ts`: admin recipe task board endpoints and `RecipeTaskPayload`.
  - `favorites.ts`: NEI favorites endpoints.
  - `modIcons.ts`: mod icon archive/admin/atlas endpoints, including background generation status polling.
  - `modIconAssetCache.ts`: server/user-scoped manifest Cache Storage; atlas page bytes are not prefetched.
  - `public/atlas-cache-sw.js`: cache-first lazy interception for every legacy mod-atlas and Atlas v2 page URL.
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
  - Shared frontend response/domain types: auth, recipes, resolution, item catalog, atlas, settings, layout, desktop/mobile icon surface settings, tasks, favorites, users, cloud files, aliases, OreDict.
- `frontend/src/services/modIconAssetCache.ts`
  - Stores the mod atlas manifest in server/user-scoped browser Cache Storage; page bytes are intentionally left to the lazy atlas-page service worker.
- `frontend/src/services/modIconAssetCache.test.ts`
  - Verifies that x32/x256 pages are not read or downloaded while restoring/refreshing the manifest.
- `frontend/src/i18n.ts`
  - UI translation tree and helper getters.
- `frontend/src/styles.css`
  - Global app styling, including CSS-variable-driven craft-grid, output, favorites, draft, task, and held-item icon sizing.
  - Craft output atlas sprites keep their 32px tile and use output scale variables so phone output icons match the icon-settings preview instead of being cropped.
- `frontend/src/styles/icon-placement.css`
  - Final shared placement layer loaded after the legacy surface styles. It applies the configured center mode consistently to NEI, favorites, drafts, recipe/CubixCraft grids, outputs, tasks, held items, and Auctions icon slots; the viewport-fixed `.held-item-cursor` remains outside the flow-positioned surface group.
- `frontend/src/styles/icon-placement.test.ts`
  - Regression check that the shared flow-positioned icon selector cannot override the held-item cursor's fixed positioning.
- `frontend/src/pages/App.tsx`
  - Builds the shared Atlas lookup with the backend ZIP-registry readiness calculation scoped inside the memo callback so repeated NEI clicks cannot hit a production minifier TDZ binding.
- `frontend/src/styles/nei.css`
  - CSS-variable-driven NEI/favorites icon-cell sizing, favorite browser tabs, hidden favorite settings menu, compact mobile item action menu, and mobile item-inspection presentation.
- `frontend/src/styles/mobile.css`
  - Phone/tablet presentation layer for the main workspace, recipe builder, CSS-variable-driven craft grid/output sizing, compact NEI tabs/search, touch held-item bar, and modal sizing.
  - Narrow phone rules must not clamp 9x9 craft/output icon settings behind the profile values; the settings preview and runtime board should use the same CSS variables.
- `frontend/src/styles/mobile-craft-icons.css`
  - Touch-only craft-board icon centering rules loaded after `mobile.css`; explicitly centers recipe-builder grid/output icons with absolute 50% positioning plus translate/scale so Android Chrome does not place transformed atlas sprites in a slot corner.
- `frontend/src/styles/mobile-shell.css`
  - Phone app drawer presentation layer for global navigation, server switching, settings, logout, and contextual editor tools.

### Frontend Tests
- `frontend/src/App.test.tsx`: large application workflow coverage.
- `frontend/src/App.test.tsx`: includes a regression check for repeated NEI clicks and double-click output selection keeping the editor mounted.
- `frontend/src/features/nei/NeiIconItem.tsx`: covered through App NEI/favorites interaction tests.
- `frontend/src/features/nei-favorites/NeiFavoritesPanel.tsx`: covered through App favorite-tab and hidden-settings tests.
- `frontend/src/features/mobile-shell/MobileAppMenu.test.tsx`: mobile app drawer behavior.
- `frontend/src/features/recipe-editor/MobileRecipeWorkspace.test.tsx`: mobile recipe workspace shell behavior.
- `frontend/src/features/recipe-editor/recipeMatrix.test.ts`: recipe matrix helper behavior.
- `frontend/src/app/workspaceNavigation.test.ts`: app-shell workspace tab map, labels, and permission filtering.
- Global settings modal behavior is covered through `frontend/src/App.test.tsx`.
- Technical panel shell/sidebar behavior is covered through `frontend/src/App.test.tsx`.
- Debug event list behavior is covered through `frontend/src/App.test.tsx`.
- Diagnostics logs panel behavior is covered through `frontend/src/App.test.tsx`.
- Diagnostics runtime panel behavior is covered through `frontend/src/App.test.tsx`.
- Diagnostics overview panel behavior is covered through `frontend/src/App.test.tsx`.
- Diagnostics recipe panel behavior is covered through `frontend/src/App.test.tsx`.
- Diagnostics access panel behavior is covered through `frontend/src/App.test.tsx`.
- Mod replacement technical-panel behavior is covered through `frontend/src/App.test.tsx`.
- Item case-alias technical-panel behavior is covered through `frontend/src/App.test.tsx`.
- Auction command generation is covered by `frontend/src/features/auctions/auctionCommands.test.ts`.
- Auction day-folder creation/copy/defaults/summary/server-ID status are covered by `frontend/src/features/auctions/auctionDayFolders.test.ts`.
- Auction lot first-item naming and item ordering helpers are covered by `frontend/src/features/auctions/auctionLotItems.test.ts`.
- Auction graph point aggregation, tags, day movement, same-day conflict blocking, and graph duplication are covered by `frontend/src/features/auctions/auctionGraphModel.test.ts`.
- Auction graph point folder-count labels, point-menu folder grouping, and graph-workspace summary helpers are covered by `frontend/src/features/auctions/auctionGraphUi.test.ts`.
- Auction planner backend persistence is covered by `backend/app/tests/test_auction_planner_store.py`.
- Auction workspace navigation and composition are covered by `frontend/src/app/workspaceNavigation.test.ts`; app integration is covered by `frontend/src/App.test.tsx`.
- Icon settings technical-panel entry is covered by `frontend/src/App.test.tsx`.
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
- `getItemCatalogVersion` -> `GET /api/itempanel/catalog/version`
- `bootstrapCache` -> browser-local user/server bootstrap snapshots for NEI favorites and the full item catalog; backend remains authoritative and refreshes them in the background.
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
- `getAuctionPlannerState` -> `GET /api/admin/auction-planner`
- `saveAuctionPlannerState` -> `PUT /api/admin/auction-planner`
- `getNeiFavorites` -> `GET /api/nei/favorites`
- `saveNeiFavorites` -> `PUT /api/nei/favorites`
- `getModIconAdminStatus` -> `GET /api/admin/mod-icons`
- `getModIconAtlasManifest` -> `GET /api/mod-icons/atlas`
- `uploadModIconArchive` -> `POST /api/admin/mod-icons/archive`
- `getModIconArchiveDownloadUrl` -> `GET /api/admin/mod-icons/archive`
- `deleteModIconArchive` -> `DELETE /api/admin/mod-icons/archive`
- `cleanModIconArchive` -> `POST /api/admin/mod-icons/archive/clean`
- `generateModIconAtlases` -> `POST /api/admin/mod-icons/generate`, then polls `GET /api/admin/mod-icons/generate/status` until the ZIP atlas is ready.
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
- Backend files: `items/item_catalog.py`, `items/itempanel_merge.py`, `indexer/itempanel_icon_catalog.py`, `indexer/itempanel_atlas_builder.py`, `indexer/itempanel_atlas_cache.py`, `services/server_manager.py`, `api/routes.py`.
- Frontend files: `pages/App.tsx`, `features/item-catalog/ItemTextureToolsPanel.tsx`, `features/nei/NeiIconItem.tsx`, `features/nei-favorites/NeiFavoritesPanel.tsx`, `services/api/*`, `services/itemAssetCache.ts`, `services/itemAssetCache.test.ts`, `components/ItemTooltipLayer.tsx`, `components/ItemTooltipLayer.test.tsx`, `components/RecipeGrid.tsx`, `types/index.ts`, `styles/nei.css`, `frontend/public/itempanel.csv`, `frontend/public/itempanel-atlas.json`.
- Data files: root/server `itempanel.csv`, `itempanel.json`, `itempanel_merged.csv`, `itempanel_icons/`, `itempanel_atlas_cache/`, `oredict.txt`.
- APIs: `/itempanel/catalog`, `/itempanel/atlas`, `/itempanel/atlas.png`, `/admin/itempanel/csv`, `/admin/itempanel/json`, `/admin/itempanel/merge`, `/admin/itempanel/merged`.
- Important rule: real NBT comes from `nbt_raw` / `.withTag(...)`, not CSV `Has NBT=true` alone.
- Important frontend rule: build `itemPanelEntryByRaw` before any `resolveCellTitle` memo can run; NBT draft titles use the exact raw lookup during editor transitions.
- Important frontend rule: icon loading may rerender `pages/App.tsx`; texture-mod selection synchronization must preserve the existing state object when values are unchanged, and `ItemTooltipLayer` must avoid publishing identical positions.

### Icon Indexing and Resolver
- Backend files: `indexer/asset_index.py`, `indexer/itempanel_icon_catalog.py`, `indexer/itempanel_atlas_builder.py`, `indexer/itempanel_atlas_cache.py`, `resolver/item_resolver.py`, `services/mod_icon_atlas_service.py`, `api/routes.py`.
- Frontend files: `pages/App.tsx`, `features/diagnostics/DiagnosticsModIconsPanel.tsx`, `components/AnimatedIcon.tsx`, `components/RecipeGrid.tsx`, `services/api/*`.
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
- Backend files: `storage/recipe_drafts.py`, `storage/recipe_draft_preferences.py`, `items/custom_items.py`, `api/routes.py`, `api/schemas.py`.
- Frontend files: `pages/App.tsx`, `features/drafts/DraftsWorkspace.tsx`, `components/NbtTreeEditor.tsx`, `services/api/*`, `types/index.ts`.
- `features/drafts/DraftsWorkspace.tsx` owns the compact draft item grid, shared-region rendering, primary-recipe ★ state, editable recipe preview, recipe pagination, Ctrl/⌘ multi-selection, and the batch cloud-export selection UI; `features/drafts/useDraftsWorkspaceState.ts` owns state shared by the separated draft regions; `pages/App.tsx` owns data loading, exact NBT lookup, preference autosave, and cloud upload orchestration.
- Data files: `recipe_draft_templates.json`, `recipe_draft_preferences.json`, `custom_items/`.
- APIs: `/recipe-drafts/templates`, `/recipe-drafts/preferences`, `/items/custom`.

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
- `storage/recipe_tasks.py`, `storage/recipe_drafts.py`, `storage/recipe_draft_preferences.py`, `storage/nei_favorites.py`, `items/custom_items.py` -> auth permissions.

### Frontend Import Direction
- `main.tsx` -> `pages/App`, auth gate, server select, debug log, types.
- `pages/App.tsx` -> shared components, tasks feature, runtime config, i18n, API client, debug log, auth permissions, types.
- `pages/App.tsx` -> `features/recipe-editor/recipeMatrix` for recipe matrix source-shaping helpers.
- `pages/App.tsx` -> `services/itemAssetCache.ts` for persistent server/user-scoped itempanel atlas snapshots and `services/bootstrapCache.ts` for early NEI favorites/catalog restoration.
- `pages/App.tsx` -> `services/modIconAssetCache.ts` for persistent server/user-scoped mod-atlas manifest loading; `main.tsx` registers `public/atlas-cache-sw.js` for lazy page caching.
- `main.tsx` -> `styles.css`, `styles/nei.css`, `styles/mobile.css`, `styles/mobile-craft-icons.css`, `styles/mobile-shell.css`.
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
