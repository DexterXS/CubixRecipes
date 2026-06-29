import { type DragEvent, type MouseEvent, type PointerEvent, type ReactNode, useRef } from 'react';

const LONG_PRESS_MS = 520;
const MOVE_CANCEL_PX = 10;

interface TouchState {
  x: number;
  y: number;
  moved: boolean;
  longPressed: boolean;
  blockClick: boolean;
  timer: number | null;
}

export interface NeiIconItemProps {
  raw: string;
  pickRaw?: string;
  ariaLabelPrefix: string;
  className: string;
  icon: ReactNode;
  tooltip?: ReactNode;
  children?: ReactNode;
  draggable?: boolean;
  onPick: (raw: string) => void;
  onOutputPick: (raw: string) => void;
  onOpenActions: (raw: string, x: number, y: number, event?: MouseEvent<HTMLElement>) => void;
  onInspect: (raw: string, x: number, y: number) => void;
  onHover: (raw: string | null) => void;
  onDragStart?: (event: DragEvent<HTMLButtonElement>, raw: string) => void;
  onDragEnd?: (raw: string) => void;
}

export function NeiIconItem({
  raw,
  pickRaw = raw,
  ariaLabelPrefix,
  className,
  icon,
  tooltip,
  children,
  draggable = true,
  onPick,
  onOutputPick,
  onOpenActions,
  onInspect,
  onHover,
  onDragStart,
  onDragEnd
}: NeiIconItemProps) {
  const touchRef = useRef<TouchState | null>(null);

  const clearLongPressTimer = () => {
    const state = touchRef.current;
    if (state?.timer !== null && state?.timer !== undefined) {
      window.clearTimeout(state.timer);
      state.timer = null;
    }
  };

  const resetTouchStateSoon = () => {
    window.setTimeout(() => {
      touchRef.current = null;
    }, 0);
  };

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    onHover(raw);
    if (event.pointerType === 'mouse') {
      return;
    }
    const startX = Number.isFinite(event.clientX) ? event.clientX : 0;
    const startY = Number.isFinite(event.clientY) ? event.clientY : 0;
    const state: TouchState = {
      x: startX,
      y: startY,
      moved: false,
      longPressed: false,
      blockClick: false,
      timer: null
    };
    state.timer = window.setTimeout(() => {
      state.longPressed = true;
      state.blockClick = true;
      onInspect(raw, startX, startY);
    }, LONG_PRESS_MS);
    touchRef.current = state;
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const state = touchRef.current;
    if (!state || event.pointerType === 'mouse') {
      return;
    }
    const currentX = Number.isFinite(event.clientX) ? event.clientX : state.x;
    const currentY = Number.isFinite(event.clientY) ? event.clientY : state.y;
    const moved = Math.abs(currentX - state.x) > MOVE_CANCEL_PX
      || Math.abs(currentY - state.y) > MOVE_CANCEL_PX;
    if (moved) {
      state.moved = true;
      state.blockClick = true;
      clearLongPressTimer();
    }
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== 'mouse') {
      clearLongPressTimer();
      resetTouchStateSoon();
    }
  };

  const handlePointerCancel = () => {
    const state = touchRef.current;
    if (state) {
      state.blockClick = true;
    }
    clearLongPressTimer();
    resetTouchStateSoon();
  };

  const handleClick = () => {
    const state = touchRef.current;
    if (state?.blockClick || state?.moved || state?.longPressed) {
      return;
    }
    onPick(pickRaw);
  };

  return (
    <span className="nei-item-cell">
      <button
        type="button"
        className={className}
        aria-label={`${ariaLabelPrefix}-${raw}`}
        data-item-raw={raw}
        draggable={draggable}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onMouseEnter={() => onHover(raw)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(raw)}
        onBlur={() => onHover(null)}
        onDragStart={(event) => onDragStart?.(event, pickRaw)}
        onDragEnd={() => onDragEnd?.(pickRaw)}
        onClick={handleClick}
        onDoubleClick={() => onOutputPick(pickRaw)}
        onContextMenu={(event) => {
          event.preventDefault();
          onOpenActions(raw, event.clientX, event.clientY, event);
        }}
      >
        {icon}
        {tooltip}
        {children}
      </button>
      <button
        type="button"
        className="nei-item-more"
        aria-label={`${ariaLabelPrefix}-actions-${raw}`}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          onOpenActions(raw, rect.right, rect.top, event);
        }}
      >
        ...
      </button>
    </span>
  );
}
