import { expect, test } from 'vitest';

import { matrixForRecipeSource, normalizeGridSize, recipeTypeFromCraftMode, resizeMatrix } from './recipeMatrix';

test('soft shaped recipe source trims empty matrix edges', () => {
  const source = matrixForRecipeSource([
    [null, null, null],
    [null, '<minecraft:stick>', null],
    [null, null, null],
  ], 'ct_shaped', 'soft');

  expect(source).toEqual([['<minecraft:stick>']]);
});

test('strict and shapeless recipe sources preserve empty matrix positions', () => {
  const matrix = [
    [null, '<minecraft:stick>'],
    [null, null],
  ];

  expect(matrixForRecipeSource(matrix, 'ct_shaped', 'strict')).toEqual(matrix);
  expect(matrixForRecipeSource(matrix, 'ct_shapeless', 'soft')).toEqual(matrix);
});

test('recipe type and matrix sizing helpers keep supported grid sizes', () => {
  expect(normalizeGridSize(1)).toBe(2);
  expect(normalizeGridSize(3)).toBe(3);
  expect(normalizeGridSize(9)).toBe(9);
  expect(recipeTypeFromCraftMode('shapeless', 3)).toBe('ct_shapeless');
  expect(recipeTypeFromCraftMode('shaped', 9)).toBe('avaritia_extreme_shaped');
  expect(resizeMatrix([['<minecraft:stick>']], 2)).toEqual([
    ['<minecraft:stick>', null],
    [null, null],
  ]);
});
