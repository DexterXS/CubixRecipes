import { describe, expect, test } from 'vitest';

import { normalizeRecipeIngredientRaw } from './recipeIngredientRaw';

describe('normalizeRecipeIngredientRaw', () => {
  test('removes mutable energy NBT and accepts every metadata variant', () => {
    const raw = '<IC2:itemBatCrystal:1>.withTag({charge:1000000.0d})';

    expect(normalizeRecipeIngredientRaw(raw)).toBe('<IC2:itemBatCrystal:*>');
  });

  test('recognizes different energy storage field names', () => {
    const raw = '<EnderIO:itemCapacitor:1>.withTag({type:"SIMPLE",storedEnergyRF:1000000})';

    expect(normalizeRecipeIngredientRaw(raw)).toBe('<EnderIO:itemCapacitor:*>');
  });

  test('recognizes RF and EU energy fields', () => {
    const raw = '<energyadditions:energyCell>.withTag({rfenergy:500000000,euenergy:500000000})';

    expect(normalizeRecipeIngredientRaw(raw)).toBe('<energyadditions:energyCell:*>');
  });

  test('preserves non-energy NBT ingredients', () => {
    const raw = '<minecraft:enchanted_book>.withTag({StoredEnchantments:[{lvl:3 as short,id:35 as short}]})';

    expect(normalizeRecipeIngredientRaw(raw)).toBe(raw);
  });
});
