import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const TOOLTIP_GAP = 10;
const VIEWPORT_GUTTER = 8;

export interface TooltipAnchorRect {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface TooltipSize {
  width: number;
  height: number;
}

export interface TooltipViewport {
  width: number;
  height: number;
}

export interface TooltipPosition {
  left: number;
  top: number;
}

export function calculateItemTooltipPosition(
  anchor: TooltipAnchorRect,
  tooltip: TooltipSize,
  viewport: TooltipViewport
): TooltipPosition {
  const rightSpace = viewport.width - anchor.right;
  const leftSpace = anchor.left;
  const fitsRight = rightSpace >= tooltip.width + TOOLTIP_GAP;
  const fitsLeft = leftSpace >= tooltip.width + TOOLTIP_GAP;
  const placeRight = fitsRight || !fitsLeft;
  const preferredLeft = placeRight
    ? anchor.right + TOOLTIP_GAP
    : anchor.left - tooltip.width - TOOLTIP_GAP;
  const maxLeft = Math.max(VIEWPORT_GUTTER, viewport.width - tooltip.width - VIEWPORT_GUTTER);
  const left = Math.min(Math.max(preferredLeft, VIEWPORT_GUTTER), maxLeft);
  const preferredTop = anchor.top + (anchor.height - tooltip.height) / 2;
  const maxTop = Math.max(VIEWPORT_GUTTER, viewport.height - tooltip.height - VIEWPORT_GUTTER);
  const top = Math.min(Math.max(preferredTop, VIEWPORT_GUTTER), maxTop);
  return { left, top };
}

interface HoveredItem {
  element: HTMLElement;
  raw: string;
}

interface ItemTooltipLayerProps {
  renderTooltip: (raw: string) => ReactNode;
}

function itemElementFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const element = target.closest<HTMLElement>('[data-item-raw]');
  if (!element || element.dataset.itemTooltipDisabled === 'true') {
    return null;
  }
  return element.dataset.itemRaw?.trim() ? element : null;
}

function anchorRectFromElement(element: HTMLElement): TooltipAnchorRect {
  const rect = element.getBoundingClientRect();
  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height
  };
}

export function ItemTooltipLayer({ renderTooltip }: ItemTooltipLayerProps) {
  const [hoveredItem, setHoveredItem] = useState<HoveredItem | null>(null);
  const [position, setPosition] = useState<TooltipPosition | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const setHoveredFromTarget = (target: EventTarget | null, pointerType?: string) => {
      if (pointerType && pointerType !== 'mouse') {
        setHoveredItem(null);
        return;
      }
      const element = itemElementFromTarget(target);
      if (!element) {
        return;
      }
      const raw = element.dataset.itemRaw?.trim();
      if (!raw) {
        return;
      }
      setHoveredItem((current) => current?.element === element && current.raw === raw ? current : { element, raw });
    };

    const clearHoveredItem = (target: EventTarget | null, relatedTarget: EventTarget | null) => {
      const element = itemElementFromTarget(target);
      if (!element || (relatedTarget instanceof Node && element.contains(relatedTarget))) {
        return;
      }
      setHoveredItem((current) => current?.element === element ? null : current);
    };

    const handlePointerOver = (event: PointerEvent) => setHoveredFromTarget(event.target, event.pointerType);
    const handlePointerOut = (event: PointerEvent) => clearHoveredItem(event.target, event.relatedTarget);
    const handleFocusIn = (event: FocusEvent) => setHoveredFromTarget(event.target);
    const handleFocusOut = (event: FocusEvent) => clearHoveredItem(event.target, event.relatedTarget);

    document.addEventListener('pointerover', handlePointerOver, true);
    document.addEventListener('pointerout', handlePointerOut, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('focusout', handleFocusOut, true);
    return () => {
      document.removeEventListener('pointerover', handlePointerOver, true);
      document.removeEventListener('pointerout', handlePointerOut, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('focusout', handleFocusOut, true);
    };
  }, []);

  useLayoutEffect(() => {
    const tooltip = tooltipRef.current;
    if (!hoveredItem || !tooltip) {
      setPosition(null);
      return;
    }

    const updatePosition = () => {
      if (!hoveredItem.element.isConnected) {
        setHoveredItem(null);
        return;
      }
      const nextPosition = calculateItemTooltipPosition(
        anchorRectFromElement(hoveredItem.element),
        { width: tooltip.offsetWidth, height: tooltip.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight }
      );
      setPosition(nextPosition);
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [hoveredItem, renderTooltip]);

  if (!hoveredItem || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={tooltipRef}
      className="item-tooltip-layer"
      style={{
        left: position ? `${position.left}px` : '0px',
        top: position ? `${position.top}px` : '0px',
        visibility: position ? 'visible' : 'hidden'
      }}
      aria-hidden="true"
    >
      {renderTooltip(hoveredItem.raw)}
    </div>,
    document.body
  );
}
