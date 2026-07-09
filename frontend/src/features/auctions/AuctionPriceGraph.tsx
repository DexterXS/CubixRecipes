import { useRef } from 'react';
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
  onMovePoint: (currency: AuctionCurrency, sourceDay: number, targetDay: number, value: number) => void;
  onOpenPoint: (currency: AuctionCurrency, day: number, x: number, y: number) => void;
  onDropAuction: (currency: AuctionCurrency, folderId: string, auctionId: string, targetDay: number) => void;
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
  day: number;
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

export function AuctionPriceGraph({ series, onMovePoint, onOpenPoint, onDropAuction }: AuctionPriceGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  const pointerToGraph = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height
    };
  };

  const updateFromPointer = (clientX: number, clientY: number) => {
    const drag = dragRef.current;
    const point = pointerToGraph(clientX, clientY);
    if (!drag || !point) return;
    const targetDay = dayFromX(point.x);
    const value = Number(valueFromY(point.y).toFixed(2));
    onMovePoint(drag.currency, drag.day, targetDay, value);
    dragRef.current = { currency: drag.currency, day: targetDay };
  };

  return (
    <svg
      ref={svgRef}
      className="auction-price-graph"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="auction-price-graph"
      onPointerMove={(event) => updateFromPointer(event.clientX, event.clientY)}
      onPointerUp={() => { dragRef.current = null; }}
      onPointerCancel={() => { dragRef.current = null; }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('application/x-auction-graph-auction')) event.preventDefault();
      }}
      onDrop={(event) => {
        const raw = event.dataTransfer.getData('application/x-auction-graph-auction');
        const point = pointerToGraph(event.clientX, event.clientY);
        if (!raw || !point) return;
        event.preventDefault();
        const payload = JSON.parse(raw) as { currency: AuctionCurrency; folderId: string; auctionId: string };
        onDropAuction(payload.currency, payload.folderId, payload.auctionId, dayFromX(point.x));
      }}
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
        const activeDays = item.points.map((point) => point.day);
        const points = controlPoints(item.values, activeDays);
        const line = smoothPath(points);
        const fill = areaPath(line, points);
        return (
          <g key={item.currency} className="auction-graph-series" style={{ color: item.color }}>
            <path className="auction-graph-fill" d={fill} fill={`url(#auctionGraphFill-${item.currency})`} />
            <path className="auction-graph-line" d={line} />
            {item.points.map((point) => {
              const value = point.editable ? (item.values[point.day] ?? 1) : point.value;
              const folderCount = countAuctionGraphPointFolders(point);
              return (
                <g key={`${item.currency}-${point.day}`} className={point.editable ? 'auction-graph-point-wrap editable' : 'auction-graph-point-wrap readonly'} style={{ color: point.color ?? item.color }}>
                  <title>{pointTitle(point, value)}</title>
                  <circle
                    className="auction-graph-point"
                    cx={xForDay(point.day)}
                    cy={yForValue(value)}
                    r={point.editable ? 7 : 6}
                    tabIndex={0}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      onOpenPoint(item.currency, point.day, event.clientX, event.clientY);
                    }}
                    onPointerDown={(event) => {
                      if (!point.editable || event.button !== 0) return;
                      event.currentTarget.setPointerCapture(event.pointerId);
                      dragRef.current = { currency: item.currency, day: point.day };
                      updateFromPointer(event.clientX, event.clientY);
                    }}
                  />
                  <text className="auction-graph-point-count" x={xForDay(point.day)} y={Math.max(18, yForValue(value) - 12)}>
                    {folderCount > 1 ? `x${folderCount}` : percentLabel(value)}
                  </text>
                  <text className="auction-graph-day" x={xForDay(point.day)} y={height - 10}>D{point.day + 1}</text>
                </g>
              );
            })}
          </g>
        );
      })}
    </svg>
  );
}
