export type CellValue = string | null;
export type DisplayMode = 'text' | 'icons';
export type DensityMode = 'compact' | 'normal' | 'wide';
export type EditorMode = 'view' | 'edit';
export type ThemeMode = 'dark' | 'light';
export type UiScale = 1 | 1.15 | 1.3 | 1.5;
export type AppTab = 'editor' | 'preview' | 'diagnostics' | 'raw';
export type UiLanguage = 'ru' | 'en';
export type PanelId = 'hero' | 'statusBar' | 'toolbar' | 'input' | 'output' | 'grid' | 'info' | 'debug' | 'settings' | 'diagnostics' | 'preview' | 'raw';
export type PanelZone = 'topLeft' | 'topRight' | 'bottom' | 'sidebar';

export interface ResolutionView {
  item_raw?: string;
  display_name?: string | null;
  icon_asset_id?: string | null;
  icon_url?: string | null;
  animated?: boolean;
  animation_meta?: { frametime?: number; frames?: Array<number | { index?: number; time?: number }>; interpolate?: boolean } | null;
  confidence?: number;
  strategy?: string;
}

export interface RecipeView {
  recipe_uid: string;
  recipe_type: string;
  binding_mode?: 'soft' | 'strict';
  name?: string | null;
  output: { raw: string };
  output_resolution?: ResolutionView | null;
  grid_w: number;
  grid_h: number;
  matrix: { raw: CellValue; resolution?: ResolutionView | null }[][];
  source: {
    kind: string;
    path?: string | null;
  };
  remove_template?: string | null;
}

export interface PanelLayoutItem {
  id: PanelId;
  zone: PanelZone;
  order: number;
  visible: boolean;
  height?: number;
  width_units?: number;
}

export interface WorkspaceLayout {
  columns: 1 | 2 | 3;
  compact_header: boolean;
  top_split_ratio?: number;
  main_sidebar_ratio?: number;
  top_height?: number;
  bottom_height?: number;
  extreme_grid_gap?: number;
}

export interface UiPreferences {
  display_mode: DisplayMode;
  animations_enabled: boolean;
  density_mode: DensityMode;
  editor_mode: EditorMode;
  theme_mode: ThemeMode;
  ui_scale: UiScale;
  language: UiLanguage;
  active_view_tab: AppTab;
  reset_layout_version: number;
  panel_layout: PanelLayoutItem[];
  workspace_layout: WorkspaceLayout;
}

export interface ProjectSettings {
  scripts_dir: string;
  mods_dir: string;
  assets_dir: string;
  recipe_db_path: string;
  extra_icon_sources: string[];
  extra_recipe_sources: string[];
  verbose_debug_logging: boolean;
  project_config_path: string;
  ui_preferences: UiPreferences;
  validation?: Record<string, unknown>;
}

export interface ItemPanelAtlasEntry {
  x: number;
  y: number;
  w: number;
  h: number;
  display_name: string;
  item_key: string;
  meta: number | null;
}

export interface ItemPanelAtlas {
  image_url: string;
  tile_size: number;
  columns: number;
  rows: number;
  entries: Record<string, ItemPanelAtlasEntry>;
}

export interface ItemCatalogEntry {
  key: string;
  legacy_id: number | null;
  meta: number;
  has_nbt: boolean;
  display_ru: string;
  display_en: string;
  raw: string;
  nbt_raw?: string | null;
  has_icon: boolean;
  sources: string[];
}

export interface ItemCatalogResponse {
  entries: ItemCatalogEntry[];
  summary: Record<string, unknown>;
}

export type UserRole = 'admin' | 'moderator' | 'default';

export interface AuthUser {
  id: number;
  email: string;
  name?: string | null;
  avatar_url?: string | null;
  role: UserRole;
  is_root_admin: boolean;
  created_at?: string | null;
  last_login_at?: string | null;
}

export interface AuthMeResponse {
  authenticated: boolean;
  auth_configured: boolean;
  root_admin_email: string;
  configuration_error?: string | null;
  access_allowed?: boolean;
  whitelist_enabled?: boolean;
  whitelist_emails?: string[];
  user: AuthUser | null;
}

export interface AccessControlSettings {
  whitelist_enabled: boolean;
  whitelist_emails: string[];
}

export interface CustomItem {
  id: number;
  scope: 'global' | 'user';
  owner_email?: string | null;
  created_by_email: string;
  source_raw: string;
  item_raw: string;
  display_name: string;
  nbt_raw?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RecipeDraftTemplate {
  id: string;
  outputRaw: string;
  recipe: RecipeView;
  sourceText: string;
  createdByEmail: string;
  createdAt: number;
  updatedAt: number;
  name: string;
}

export interface ModIconArchiveInfo {
  name: string;
  size: number;
  modifiedAt?: string;
}

export interface ModIconAtlasEntry {
  key?: string;
  modid: string;
  iconName?: string;
  entryName?: string;
  size: number;
  page: number;
  atlasFile: string;
  image_url: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ModIconAtlasManifest {
  updatedAt?: string;
  maxAtlasSize: number;
  fallbackAtlasUrl: string;
  archives: ModIconArchiveInfo[];
  atlases: Array<{
    size: number;
    page: number;
    image_url: string;
    file: string;
    modid?: string;
    columns: number;
    rows: number;
    tileSize: number;
    entries: Record<string, ModIconAtlasEntry>;
  }>;
  entries: Record<'x32' | 'x256', Record<string, ModIconAtlasEntry>>;
  duplicates: Array<Record<string, string>>;
  rejected: Array<Record<string, string>>;
  totalMods: number;
  totalIcons?: number;
}

export interface ModIconAdminStatus {
  archives: ModIconArchiveInfo[];
  manifest: ModIconAtlasManifest | null;
  rules: {
    acceptedArchive: string;
    acceptedFiles: string[];
    maxAtlasSize: number;
  };
}

export interface ItemCaseAliasEntry {
  lower_key: string;
  original: string;
  modid: string;
  metas: string[];
  files: string[];
}

export interface ItemCaseAliasReport {
  generatedAt: string;
  sourceLabel?: string;
  aliasesPath: string;
  reportPath: string;
  manualAliasesPath?: string;
  fmlLogAliasesPath?: string;
  summary: {
    generatedAt: string;
    scriptsDir: string;
    sourceLabel?: string;
    itempanelCsv: string;
    scriptFiles: number;
    scriptItemRefs: number;
    uniqueItemKeys: number;
    mixedCaseItemAliases: number;
    itempanelKeys: number;
    matchedItemKeys: number;
    missingItemKeys: number;
    logItemAliases?: number;
    manualItemAliases?: number;
    itemConflicts: number;
    scriptEntityRefs: number;
    uniqueEntityKeys: number;
    entityConflicts: number;
  };
  itemAliases: Record<string, string>;
  autoItemAliases?: Record<string, string>;
  logItemAliases?: Record<string, string>;
  manualItemAliases?: Record<string, string>;
  fmlLogSummary?: {
    updatedAt?: string | null;
    sourceFilename?: string | null;
    totalMatches: number;
    itemMatches: number;
    blockMatches: number;
    aliases: number;
    conflicts: Array<Record<string, unknown>>;
  } | null;
  entityAliases: Record<string, string>;
  matchedItems: ItemCaseAliasEntry[];
  missingItems: ItemCaseAliasEntry[];
  missingByMod: Array<{ modid: string; count: number }>;
  itemConflicts: Array<Record<string, unknown>>;
  entityConflicts: Array<Record<string, unknown>>;
}

export interface ZsCloudFile {
  path: string;
  name: string;
  size: number;
  modifiedAt: string;
  recipeCount: number;
}

export interface ZsCloudBackup {
  id: string;
  name: string;
  originalPath: string;
  size: number;
  updatedAt: string;
}
