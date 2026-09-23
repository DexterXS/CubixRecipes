import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const placementCss = readFileSync(resolve(process.cwd(), 'src/styles/icon-placement.css'), 'utf8');
const baseCss = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

describe('held item cursor placement', () => {
  it('keeps the cursor overlay out of the flow-positioned icon group', () => {
    expect(placementCss).not.toMatch(/\.held-item-cursor,\s*\.touch-held-item-icon/);
    expect(baseCss).toMatch(/\.held-item-cursor\s*\{[^}]*position:\s*fixed;/s);
  });
});
