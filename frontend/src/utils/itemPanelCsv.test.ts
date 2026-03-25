import { describe, expect, it } from 'vitest';
import { parseItemPanelCsvText } from './itemPanelCsv';

describe('parseItemPanelCsvText', () => {
  it('parses comma-separated itempanel and keeps russian text', () => {
    const csv = [
      'item_id,id,meta,has_nbt,display_name',
      'minecraft:stone,1,0,false,Камень',
      'minecraft:stick,2,0,false,-'
    ].join('\n');

    const result = parseItemPanelCsvText(csv);
    expect(result.byKey.get('minecraft:stone')).toBe('Камень');
    expect(result.byKeyMeta.get('minecraft:stone#0')).toBe('Камень');
    expect(result.byKey.has('minecraft:stick')).toBe(false);
  });

  it('parses semicolon-separated file and quoted values with commas', () => {
    const csv = [
      'item_id;id;meta;has_nbt;display_name',
      'mod:item;1;0;false;"Линия, с запятой"',
      'mod:item2;2;0;false;  '
    ].join('\n');

    const result = parseItemPanelCsvText(csv);
    expect(result.byKey.get('mod:item')).toBe('Линия, с запятой');
    expect(result.byKeyMeta.get('mod:item#0')).toBe('Линия, с запятой');
    expect(result.byKey.has('mod:item2')).toBe(false);
  });
});
