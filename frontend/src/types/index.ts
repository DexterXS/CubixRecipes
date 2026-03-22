export type CellValue = string | null;
export type DisplayMode = 'text' | 'icons';
export type DensityMode = 'compact' | 'normal' | 'wide';
export type EditorMode = 'view' | 'edit';
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
  confidence?: number;
  strategy?: string;
}

export interface RecipeView {
  recipe_uid: string;
  recipe_type: string;
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
}

export interface UiPreferences {
  display_mode: DisplayMode;
  density_mode: DensityMode;
  editor_mode: EditorMode;
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
