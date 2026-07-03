import { useRef, useState } from 'react';

type AuctionPriceGraphProps = {
  values: number[];
  activeDays: number[];
  onChangeDay: (day: number, value: number) => void;
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

function xForDay(day: number) {
  return padding + (day / 89) * (width - padding * 2);
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

export function AuctionPriceGraph({ values, activeDays, onChangeDay }: AuctionPriceGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragDay, setDragDay] = useState<number | null>(null);
  const uniqueActiveDays = Array.from(new Set(activeDays)).filter((day) => day >= 0 && day <= 89).sort((a, b) => a - b);
  const points = controlPoints(values, uniqueActiveDays);
  const line = smoothPath(points);
  const fill = areaPath(line, points);

  const updateFromPointer = (clientY: number, day: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const y = ((clientY - rect.top) / rect.height) * height;
    onChangeDay(day, Number(valueFromY(y).toFixed(2)));
  };

  return (
    <svg
      ref={svgRef}
      className="auction-price-graph"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="auction-price-graph"
      onPointerMove={(event) => {
        if (dragDay !== null) {
          updateFromPointer(event.clientY, dragDay);
        }
      }}
      onPointerUp={() => setDragDay(null)}
      onPointerCancel={() => setDragDay(null)}
    >
      <defs>
        <linearGradient id="auctionGraphFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.34" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
      {[0.5, 1, 1.5, 2, 2.5, 3].map((value) => (
        <g key={value}>
          <line className="auction-graph-grid" x1={padding} y1={yForValue(value)} x2={width - padding} y2={yForValue(value)} />
          <text x={4} y={yForValue(value) + 4}>{percentLabel(value)}</text>
        </g>
      ))}
      <path className="auction-graph-fill" d={fill} />
      <path className="auction-graph-line" d={line} />
      {uniqueActiveDays.map((day) => (
        <g key={day}>
          <circle
            className="auction-graph-point"
            cx={xForDay(day)}
            cy={yForValue(values[day] ?? 1)}
            r={7}
            tabIndex={0}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              setDragDay(day);
              updateFromPointer(event.clientY, day);
            }}
          />
          <text className="auction-graph-day" x={xForDay(day)} y={height - 8}>D{day + 1}</text>
        </g>
      ))}
    </svg>
  );
}
