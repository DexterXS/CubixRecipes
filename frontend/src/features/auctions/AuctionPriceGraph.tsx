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

export function AuctionPriceGraph({ values, activeDays, onChangeDay }: AuctionPriceGraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragDay, setDragDay] = useState<number | null>(null);
  const line = values.map((value, day) => `${xForDay(day)},${yForValue(value)}`).join(' ');
  const uniqueActiveDays = Array.from(new Set(activeDays)).filter((day) => day >= 0 && day <= 89);

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
      <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
      <line x1={padding} y1={padding} x2={padding} y2={height - padding} />
      {[0.5, 1, 1.5, 2, 2.5, 3].map((value) => (
        <g key={value}>
          <line className="auction-graph-grid" x1={padding} y1={yForValue(value)} x2={width - padding} y2={yForValue(value)} />
          <text x={4} y={yForValue(value) + 4}>{value.toFixed(1)}x</text>
        </g>
      ))}
      <polyline className="auction-graph-line" points={line} fill="none" />
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
