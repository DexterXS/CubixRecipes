export type CellValue = string | null;

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
