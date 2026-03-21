export type CellValue = string | null;
export type DisplayMode = 'text' | 'icons';
export type DensityMode = 'compact' | 'normal' | 'wide';
export type EditorMode = 'view' | 'edit';
export type AppTab = 'editor' | 'preview' | 'diagnostics' | 'raw';
export type SectionKey = 'input' | 'settings' | 'output' | 'metadata' | 'diagnostics';

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

export interface UiPreferences {
  display_mode: DisplayMode;
  density_mode: DensityMode;
  editor_mode: EditorMode;
  collapsed_sections: Record<SectionKey, boolean>;
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
