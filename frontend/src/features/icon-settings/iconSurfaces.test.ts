import { describe, expect, it } from 'vitest';
import { buildIconSurfaceCssVars } from './iconSurfaces';

function cssVars(settings?: Parameters<typeof buildIconSurfaceCssVars>[0]): Record<string, string> {
  return buildIconSurfaceCssVars(settings, null) as Record<string, string>;
}

describe('buildIconSurfaceCssVars', () => {
  it('emits centered placement variables for scale mode', () => {
    const vars = cssVars({
      nei: { mode: 'scale', cell: 34, icon: 28, gap: 5 }
    });

    expect(vars['--icon-nei-render-position']).toBe('absolute');
    expect(vars['--icon-nei-render-left']).toBe('50%');
    expect(vars['--icon-nei-render-top']).toBe('50%');
    expect(vars['--icon-nei-render-width']).toBe('32px');
    expect(vars['--icon-nei-render-transform']).toBe('translate(-50%, -50%) scale(0.875)');
  });

  it('keeps grid and wrapper modes in normal centered grid flow', () => {
    const vars = cssVars({
      craftGrid9: { mode: 'grid', cell: 36, icon: 20, gap: 2 },
      draftPreview: { mode: 'wrapper', cell: 48, icon: 28, gap: 2 }
    });

    expect(vars['--icon-craft-grid9-render-position']).toBe('relative');
    expect(vars['--icon-craft-grid9-render-width']).toBe('20px');
    expect(vars['--icon-craft-grid9-render-transform']).toBe('none');
    expect(vars['--icon-draft-preview-render-position']).toBe('relative');
    expect(vars['--icon-draft-preview-render-left']).toBe('auto');
    expect(vars['--icon-draft-preview-render-transform']).toBe('none');
  });

  it('publishes placement variables for every configured surface', () => {
    const vars = cssVars();

    expect(vars['--icon-nei-render-transform']).toBeTruthy();
    expect(vars['--icon-favorites-render-transform']).toBeTruthy();
    expect(vars['--icon-draft-items-render-transform']).toBeTruthy();
    expect(vars['--icon-craft-output-render-transform']).toBeTruthy();
    expect(vars['--icon-draft-preview9-render-transform']).toBeTruthy();
    expect(vars['--icon-auction-nei-render-transform']).toBeTruthy();
  });
});
