export type CellValue = string | null;

export interface RecipeView {
  recipe_uid: string;
  recipe_type: string;
  output: { raw: string };
  grid_w: number;
  grid_h: number;
  matrix: { raw: CellValue }[][];
}
