import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { calculateItemTooltipPosition, ItemTooltipLayer } from './ItemTooltipLayer';

const viewport = { width: 1000, height: 800 };
const tooltip = { width: 280, height: 120 };

afterEach(() => cleanup());

describe('calculateItemTooltipPosition', () => {
  it('places the tooltip to the right when there is enough room', () => {
    expect(calculateItemTooltipPosition({ top: 300, left: 100, right: 140, bottom: 340, width: 40, height: 40 }, tooltip, viewport))
      .toEqual({ left: 150, top: 260 });
  });

  it('flips the tooltip to the left near the right viewport edge', () => {
    expect(calculateItemTooltipPosition({ top: 300, left: 920, right: 960, bottom: 340, width: 40, height: 40 }, tooltip, viewport))
      .toEqual({ left: 630, top: 260 });
  });

  it('keeps the tooltip inside the viewport vertically', () => {
    expect(calculateItemTooltipPosition({ top: 2, left: 100, right: 140, bottom: 42, width: 40, height: 40 }, tooltip, viewport))
      .toEqual({ left: 150, top: 8 });
    expect(calculateItemTooltipPosition({ top: 780, left: 100, right: 140, bottom: 820, width: 40, height: 40 }, tooltip, viewport))
      .toEqual({ left: 150, top: 672 });
  });

  it('clamps oversized tooltips to the viewport gutter', () => {
    expect(calculateItemTooltipPosition({ top: 300, left: 1, right: 21, bottom: 320, width: 20, height: 20 }, { width: 1200, height: 900 }, { width: 1000, height: 800 }))
      .toEqual({ left: 8, top: 8 });
  });

  it('renders for mouse hover but ignores touch hover', () => {
    render(
      <>
        <button type="button" data-item-raw="<example:item>">item</button>
        <ItemTooltipLayer renderTooltip={(raw) => <span>{raw}</span>} />
      </>
    );

    const item = screen.getByRole('button', { name: 'item' });
    const touchOver = new Event('pointerover', { bubbles: true });
    Object.defineProperty(touchOver, 'pointerType', { value: 'touch' });
    item.dispatchEvent(touchOver);
    expect(document.querySelector('.item-tooltip-layer')).toBeNull();

    fireEvent.pointerOver(item, { pointerType: 'mouse' });
    expect(screen.getByText('<example:item>')).toBeTruthy();
  });
});
