import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { AuctionCurrency } from './auctionTypes';

export type AuctionPriceGraphPointDetail = {
  folderId: string;
  label: string;
  folderTitle: string;
  folderCategory: 'regular' | 'planned';
  folderTagLabel: string | null;
  folderTagColor: string | null;
  startPrice: number;
  stepPrice: number;
  multiplier: number;
};

export type AuctionPriceGraphPoint = {
  day: number;
  dateLabel: string;
  editable: boolean;
  value: number;
  color: string | null;
  details: AuctionPriceGraphPointDetail[];
};

export type AuctionPriceGraphSeries = {
  currency: AuctionCurrency;
  label: string;
  color: string;
  values: number[];
  points: AuctionPriceGraphPoint[];
};

type AuctionPriceGraphProps = {
  series: AuctionPriceGraphSeries[];
  onMovePoint: (currency: AuctionCurrency, sourceDay: number, targetDay: number, value: number) => number;
  onOpenPoint: (currency: AuctionCurrency, day: number, x: number, y: number) => void;
};

const width = 760;
const height = 260;
const padding = 28;
const minValue = 0.2;
const maxValue = 3;

type GraphPoint = {
  day: number;
  x: number;
  y: number;
};

type DragState = {
  currency: AuctionCurrency;
  sourceDay: number;
  day: number;
  value: number;
  grabOffsetY: number;
};

type PendingPointer = {
  clientX: number;
  clientY: number;
};

function xForDay(day: number) {
  return padding + (day / 89) * (width - padding * 2);
}

function dayFromX(x: number) {
  const normalized = (x - padding) / (width - padding * 2);
  return Math.max(0, Math.min(89, Math.round(normalized * 89)));
}

function yForValue(value: number) {
  const normalized = (value - minValue) / (maxValue - minValue);
  return height - padding - normalized * (height - padding * 2);
}

function valueFromY(y: number) {
  const normalized = (height - padding - y) / (height - padding * 2);
  return Math.max(minValue, Math.min(maxValue, minValue + normalized * (maxValue - minValue)));
}

export function createAuctionGraphGrabOffset(pointerY: number, currentValue: number) {
  return yForValue(currentValue) - pointerY;
}

export function calculateAuctionGraphDragValue(pointerY: number, grabOffsetY: number) {
  return Number(valueFromY(pointerY + grabOffsetY).toFixed(2));
}

function percentLabel(value: number) {
  const percent = Math.round((value - 1) * 100);
  return percent > 0 ? `+${percent}%` : `${percent}%`;
}

export function countAuctionGraphPointFolders(point: Pick<AuctionPriceGraphPoint, 'details'>) {
  return new Set(point.details.map((detail) => detail.folderId)).size;
}

function pointTitle(point: AuctionPriceGraphPoint, value: number) {
  const rows = [`${point.dateLabel} · D${point.day + 1} · ${percentLabel(value)}`];
  point.details.forEach((detail) => {
    const tag = detail.folderTagLabel ? ` [${detail.folderTagLabel}]` : '';
    rows.push(`${detail.folderTitle}${tag}: ${detail.label}, старт ${detail.startPrice}, шаг ${detail.stepPrice}`);
  });
  if (!point.editable) rows.push('Статическая точка: фиолетовая/фиксированная папка не меняет график.');
  return rows.join('\n');
}

function controlPoints(values: number[], activeDays: number[]): GraphPoint[] {
  const active = Array.from(new Set(activeDays)).filter((day) => day >= 0 && day <= 89).sort((a, b) => a - b);
  const days = active.length ? active : [0, 89];
  return days.map((day) => ({ day, x: xForDay(day), y: yForValue(values[day] ?? 1) }));
}

function smoothPath(points: GraphPoint[]) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  const segments = [`M ${points[0].x} ${points[0].y}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const afterNext = points[index + 2] ?? next;
    const tension = 0.16;
    const controlOneX = current.x + (next.x - previous.x) * tension;
    const controlOneY = current.y + (next.y - previous.y) * tension;
    const controlTwoX = next.x - (afterNext.x - current.x) * tension;
    const controlTwoY = next.y - (afterNext.y - current.y) * tension;
    segments.push(`C ${controlOneX} ${controlOneY}, ${controlTwoX} ${controlTwoY}, ${next.x} ${next.y}`);
  }
  return segments.join(' ');
}

function areaPath(linePath: string, points: GraphPoint[]) {
  if (!linePath || !points.length) return '';
  const first = points[0];
  const last = points[points.length - 1];
  const baseline = yForValue(1);
  return `${linePath} L ${last.x} ${baseline} L ${first.x} ${baseline} Z`;
}

export function AuctionPriceGraph({ series, onMovePoint, onOpenPoint }: AuctionPriceGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragPreviewRef = useRef<DragState | null>(null);
  const pendingPointerRef = useRef<PendingPointer | null>(null);
  const frameRef = useRef<number | null>(null);
  const cleanupDragRef = useRef<(() => void) | null>(null);
  const onMovePointRef = useRef(onMovePoint);
  const [dragPreview, setDragPreview] = useState<DragState | null>(null);
  onMovePointRef.current = onMovePoint;

  useEffect(() => () => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    cleanupDragRef.current?.();
  }, []);

  const pointerToGraph = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height
    };
  };

  const updateDragPreview = (next: DragState | null) => {
    const previous = dragPreviewRef.current;
    const samePreview = previous && next
      && previous.currency === next.currency
      && previous.sourceDay === next.sourceDay
      && previous.day === next.day
      && previous.value === next.value;
    if (samePreview) return;
    dragPreviewRef.current = next;
    setDragPreview(next);
  };

  const updateFromPointer = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const point = pointerToGraph(clientX, clientY);
    if (!drag || !point) return;
    const targetDay = dayFromX(point.x);
    const value = calculateAuctionGraphDragValue(point.y, drag.grabOffsetY);
    const next = { currency: drag.currency, sourceDay: drag.sourceDay, day: targetDay, value, grabOffsetY: drag.grabOffsetY };
    dragRef.current = next;
    updateDragPreview(next);
  };

  const schedulePointerUpdate = (clientX: number, clientY: number) => {
    pendingPointerRef.current = { clientX, clientY };
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingPointerRef.current;
      pendingPointerRef.current = null;
      if (pending) updateFromPointer(pending.clientX, pending.clientY);
    });
  };

  const cancelPendingPointerUpdate = () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingPointerRef.current = null;
  };

  const startPointDrag = (event: ReactPointerEvent<SVGCircleElement>, currency: AuctionCurrency, day: number, value: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    cleanupDragRef.current?.();
    const graphPoint = pointerToGraph(event.clientX, event.clientY);
    const grabOffsetY = graphPoint ? createAuctionGraphGrabOffset(graphPoint.y, value) : 0;
    const initialDrag = { currency, sourceDay: day, day, value, grabOffsetY };
    dragRef.current = initialDrag;
    updateDragPreview(initialDrag);
    const handleMove = (moveEvent: PointerEvent) => schedulePointerUpdate(moveEvent.clientX, moveEvent.clientY);
    const finishDrag = (commit: boolean) => {
      cancelPendingPointerUpdate();
      const drag = dragRef.current;
      if (commit && drag) onMovePointRef.current(drag.currency, drag.sourceDay, drag.day, drag.value);
      dragRef.current = null;
      updateDragPreview(null);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', commitDrag);
      window.removeEventListener('pointercancel', cancelDrag);
      cleanupDragRef.current = null;
    };
    const commitDrag = () => finishDrag(true);
    const cancelDrag = () => finishDrag(false);
    cleanupDragRef.current = cancelDrag;
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', commitDrag);
    window.addEventListener('pointercancel', cancelDrag);
  };

  return (
    <svg
      ref={svgRef}
      className="auction-price-graph"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="auction-price-graph"
    >
      <defs>
        {series.map((item) => (
          <linearGradient key={item.currency} id={`auctionGraphFill-${item.currency}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={item.color} stopOpacity="0.24" />
            <stop offset="100%" stopColor={item.color} stopOpacity="0.02" />
          </linearGradient>
        ))}
      </defs>
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
      {[0.5, 1, 1.5, 2, 2.5, 3].map((value) => (
        <g key={value}>
          <line className="auction-graph-grid" x1={padding} y1={yForValue(value)} x2={width - padding} y2={yForValue(value)} />
          <text className="auction-graph-axis-label" x={8} y={yForValue(value) + 4}>{percentLabel(value)}</text>
        </g>
      ))}
      {series.map((item) => {
        const activeDays = item.points.map((point) => (
          dragPreview?.currency === item.currency && point.day === dragPreview.sourceDay ? dragPreview.day : point.day
        ));
        const displayValues = dragPreview?.currency === item.currency
          ? item.values.map((value, index) => index === dragPreview.day ? dragPreview.value : value)
          : item.values;
        const points = controlPoints(displayValues, activeDays);
        const line = smoothPath(points);
        const fill = areaPath(line, points);
        return (
          <g key={item.currency} className="auction-graph-series" style={{ color: item.color }}>
            <path className="auction-graph-fill" d={fill} fill={`url(#auctionGraphFill-${item.currency})`} />
            <path className="auction-graph-line" d={line} />
            {item.points.map((point) => {
              const isPreviewPoint = dragPreview?.currency === item.currency && point.day === dragPreview.sourceDay;
              const renderDay = isPreviewPoint ? dragPreview.day : point.day;
              const previewValue = isPreviewPoint ? dragPreview.value : null;
              const value = previewValue ?? (point.editable ? (item.values[point.day] ?? 1) : point.value);
              const folderCount = countAuctionGraphPointFolders(point);
              return (
                <g key={`${item.currency}-${point.day}`} className={point.editable ? 'auction-graph-point-wrap editable' : 'auction-graph-point-wrap readonly'} style={{ color: point.color ?? item.color }}>
                  <title>{pointTitle(point, value)}</title>
                  <circle
                    className="auction-graph-point"
                    cx={xForDay(renderDay)}
                    cy={yForValue(value)}
                    r={point.editable ? 7 : 6}
                    tabIndex={0}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onOpenPoint(item.currency, point.day, event.clientX, event.clientY);
                    }}
                    onPointerDown={(event) => point.editable && startPointDrag(event, item.currency, point.day, value)}
                  />
                  <text className="auction-graph-point-count" x={xForDay(renderDay)} y={Math.max(18, yForValue(value) - 12)}>
                    {folderCount > 1 ? `x${folderCount}` : percentLabel(value)}
                  </text>
                  <text className="auction-graph-day" x={xForDay(renderDay)} y={height - 10}>D{renderDay + 1}</text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
