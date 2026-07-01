import { CellValue, RecipeView } from '../../types';

export type RecipeType = 'ct_shaped' | 'ct_shapeless' | 'avaritia_extreme_shaped';
export type RecipeCraftMode = 'shaped' | 'shapeless';
export type RecipeBindingMode = 'soft' | 'strict';

export function cloneMatrix(matrix: CellValue[][]): CellValue[][] {
  return matrix.map((row) => [...row]);
}

export function toCellMatrix(recipe: RecipeView): CellValue[][] {
  return recipe.matrix.map((row) => row.map((cell) => cell.raw));
}

export function maxGridWidth(matrix: CellValue[][]): number {
  return Math.max(0, ...matrix.map((row) => row.length));
}

export function normalizeGridSize(size: number): 2 | 3 | 9 {
  if (size >= 9) return 9;
  return size <= 2 ? 2 : 3;
}

export function resizeMatrix(matrix: CellValue[][], size: number): CellValue[][] {
  return Array.from({ length: size }, (_, rowIndex) => (
    Array.from({ length: size }, (_, colIndex) => matrix[rowIndex]?.[colIndex] ?? null)
  ));
}

function rowIsEmpty(row: CellValue[]): boolean {
  return row.every((cell) => !cell || cell === 'null');
}

function columnIsEmpty(matrix: CellValue[][], index: number): boolean {
  return matrix.every((row) => index >= row.length || !row[index] || row[index] === 'null');
}

export function trimMatrixEdges(matrix: CellValue[][]): CellValue[][] {
  if (!matrix.length) return [[null]];
  let top = 0;
  let bottom = matrix.length;
  while (top < bottom && rowIsEmpty(matrix[top])) top += 1;
  while (bottom > top && rowIsEmpty(matrix[bottom - 1])) bottom -= 1;
  const cropped = matrix.slice(top, bottom).map((row) => [...row]);
  if (!cropped.length) return [[null]];
  let left = 0;
  let right = maxGridWidth(cropped);
  while (left < right && columnIsEmpty(cropped, left)) left += 1;
  while (right > left && columnIsEmpty(cropped, right - 1)) right -= 1;
  const trimmed = cropped.map((row) => row.slice(left, right));
  const width = Math.max(1, maxGridWidth(trimmed));
  return trimmed.map((row) => [...row, ...Array.from({ length: Math.max(0, width - row.length) }, () => null)]);
}

export function matrixForRecipeSource(matrix: CellValue[][], recipeType: string, bindingMode: RecipeBindingMode): CellValue[][] {
  if (recipeType === 'avaritia_extreme_shaped' || bindingMode === 'strict' || recipeType === 'ct_shapeless') {
    const width = Math.max(1, maxGridWidth(matrix));
    return matrix.length
      ? matrix.map((row) => [...row, ...Array.from({ length: Math.max(0, width - row.length) }, () => null)])
      : [[null]];
  }
  return trimMatrixEdges(matrix);
}

export function recipeTypeFromCraftMode(mode: RecipeCraftMode, gridSize: number): RecipeType {
  if (gridSize >= 9) return 'avaritia_extreme_shaped';
  return mode === 'shapeless' ? 'ct_shapeless' : 'ct_shaped';
}

export function craftModeFromRecipeType(recipeType: string): RecipeCraftMode {
  return recipeType === 'ct_shapeless' ? 'shapeless' : 'shaped';
}
