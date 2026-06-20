import { type CSSProperties, type MouseEvent, useEffect, useMemo, useRef } from 'react';
import { AnimatedIcon } from './AnimatedIcon';
import { CellValue, DisplayMode, EditorMode, ItemPanelAtlas, ItemPanelAtlasEntry, ResolutionView } from '../types';

interface Props {
  matrix: { raw: CellValue; resolution?: ResolutionView | null }[][];
  atlas?: ItemPanelAtlas | null;
  atlasImageUrl?: string;
  displayMode: DisplayMode;
  animationsEnabled: boolean;
  editorMode: EditorMode;
  heldItemRaw?: string | null;
  tooltipsDisabled?: boolean;
  onCellChange: (row: number, col: number, value: string) => void;
  onCellClick: (row: number, col: number) => void;
  onCellContextMenu: (row: number, col: number, event?: MouseEvent) => void;
  resolveCellTitle: (raw: string) => string;
  resolveIconStyle?: (raw: string) => CSSProperties | undefined;
  onCellDrop?: (row: number, col: number, value: string) => void;
  onItemHover?: (raw: string | null) => void;
  extremeGroupGap?: number;
}

function shortenCellValue(value: string): string {
  return value.length > 14 ? `${value.slice(0, 12)}...` : value;
}

function parseAtlasRaw(raw: string): { key: string; meta: number; wildcardMeta: boolean } | null {
  const match = raw.trim().match(/^<([a-zA-Z0-9_.-]+:[a-zA-Z0-9_./-]+)(?::([0-9*]+))?>/);
  if (!match) return null;
  const rawMeta = match[2] ?? '0';
  return {
    key: match[1].toLowerCase(),
    meta: rawMeta === '*' ? 0 : (Number.parseInt(rawMeta, 10) || 0),
    wildcardMeta: rawMeta === '*'
  };
}

type PaintMode = 'fill' | 'clear';

export function RecipeGrid({
  matrix,
  atlas,
  atlasImageUrl,
  displayMode: _displayMode,
  animationsEnabled,
  editorMode,
  heldItemRaw,
  tooltipsDisabled,
  onCellChange,
  onCellClick,
  onCellContextMenu,
  resolveCellTitle,
  resolveIconStyle,
  onCellDrop,
  onItemHover,
  extremeGroupGap = 8
}: Props) {
  const size = Math.max(matrix.length, matrix[0]?.length ?? 0, 1);
  const cellClass = size >= 9 ? 'grid-cell size-9' : 'grid-cell size-3';
  const paintModeRef = useRef<PaintMode | null>(null);
  const paintedCellsRef = useRef<Set<string>>(new Set());
  const atlasByKeyMeta = useMemo(() => {
    const byKeyMeta = new Map<string, ItemPanelAtlasEntry>();
    Object.values(atlas?.entries ?? {}).forEach((entry) => {
      byKeyMeta.set(`${entry.item_key}:${entry.meta ?? 0}`, entry);
    });
    return byKeyMeta;
  }, [atlas]);
  const atlasFirstByKey = useMemo(() => {
    const firstByKey = new Map<string, ItemPanelAtlasEntry>();
    Object.values(atlas?.entries ?? {}).forEach((entry) => {
      if (!firstByKey.has(entry.item_key)) {
        firstByKey.set(entry.item_key, entry);
      }
    });
    return firstByKey;
  }, [atlas]);

  function resolveAtlasEntry(value: string): ItemPanelAtlasEntry | undefined {
    const exact = atlas?.entries[value];
    if (exact) return exact;
    const parsed = parseAtlasRaw(value);
    if (!parsed) return undefined;
    if (parsed.wildcardMeta) {
      return atlasFirstByKey.get(parsed.key) ?? atlasByKeyMeta.get(`${parsed.key}:0`);
    }
    return atlas?.entries[`<${parsed.key}${parsed.meta > 0 ? `:${parsed.meta}` : ''}>`]
      ?? atlasByKeyMeta.get(`${parsed.key}:${parsed.meta}`)
      ?? atlasByKeyMeta.get(`${parsed.key}:0`)
      ?? atlasFirstByKey.get(parsed.key);
  }

  function stopCellPaint() {
    paintModeRef.current = null;
    paintedCellsRef.current.clear();
  }

  useEffect(() => {
    const handleMouseMove = (event: globalThis.MouseEvent) => {
      if (!paintModeRef.current) {
        return;
      }
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const cellElement = target?.closest<HTMLElement>('[data-craft-cell="true"]');
      if (!cellElement) {
        return;
      }
      const row = Number(cellElement.dataset.row);
      const col = Number(cellElement.dataset.col);
      if (Number.isFinite(row) && Number.isFinite(col)) {
        continueCellPaint(row, col);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopCellPaint);
    window.addEventListener('blur', stopCellPaint);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopCellPaint);
      window.removeEventListener('blur', stopCellPaint);
    };
  });

  function paintCell(row: number, col: number, mode: PaintMode) {
    const key = `${row}:${col}`;
    if (paintedCellsRef.current.has(key)) {
      return;
    }
    paintedCellsRef.current.add(key);
    if (mode === 'fill' && heldItemRaw) {
      onCellChange(row, col, heldItemRaw);
    }
    if (mode === 'clear') {
      onCellContextMenu(row, col);
    }
  }

  function startCellPaint(event: MouseEvent, row: number, col: number) {
    if (editorMode === 'view') return;
    if (event.button === 0 && heldItemRaw) {
      event.preventDefault();
      paintModeRef.current = 'fill';
      paintedCellsRef.current.clear();
      paintCell(row, col, 'fill');
      return;
    }
    if (event.button === 2 && !heldItemRaw && !event.ctrlKey) {
      event.preventDefault();
      paintModeRef.current = 'clear';
      paintedCellsRef.current.clear();
      paintCell(row, col, 'clear');
    }
  }

  function continueCellPaint(row: number, col: number) {
    if (editorMode === 'view') return;
    const mode = paintModeRef.current;
    if (!mode) return;
    if (mode === 'fill' && !heldItemRaw) return;
    if (mode === 'clear' && heldItemRaw) return;
    paintCell(row, col, mode);
  }

  const gridStyle = size >= 9
    ? ({ '--extreme-grid-gap': `${Math.max(0, Math.min(Math.round(extremeGroupGap), 24))}px` } as CSSProperties)
    : undefined;

  return (
    <div className="grid-wrap" data-grid-size={size} style={gridStyle}>
      {matrix.map((row, rowIndex) => (
        <div key={rowIndex} className={`grid-row ${size >= 9 && rowIndex > 0 && rowIndex % 3 === 0 ? 'group-row-start' : ''}`.trim()}>
          {row.map((cell, colIndex) => {
            const raw = cell?.raw ?? null;
            const isEmpty = raw === null || raw === '' || raw === 'null';
            const isInvalid = !isEmpty && !String(raw).startsWith('<');
            const value = isEmpty ? '' : String(raw);
            const iconUrl = cell?.resolution?.icon_url ?? null;
            const externalAtlasStyle = value ? resolveIconStyle?.(value) : undefined;
            const atlasEntry = value ? resolveAtlasEntry(value) : undefined;
            const atlasStyle = !externalAtlasStyle && atlas && atlasEntry && atlasImageUrl
              ? {
                backgroundImage: `url(${atlasImageUrl})`,
                backgroundPosition: `-${atlasEntry.x}px -${atlasEntry.y}px`,
                backgroundSize: `${atlas.columns * atlas.tile_size}px ${atlas.rows * atlas.tile_size}px`
              }
              : undefined;
            const resolverTitle = cell?.resolution?.display_name?.trim();
            const atlasTitle = atlasEntry?.display_name?.trim();
            const localizedTitle = value ? resolveCellTitle(value) : '';
            const title = value
              ? (localizedTitle && localizedTitle !== value
                ? localizedTitle
                : (atlasTitle || (resolverTitle && resolverTitle !== value && !resolverTitle.startsWith('<') ? resolverTitle : value)))
              : 'Пустая ячейка';

            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={`${cellClass} ${size >= 9 && colIndex > 0 && colIndex % 3 === 0 ? 'group-col-start' : ''} ${isEmpty ? 'is-empty' : 'is-filled'} ${isInvalid ? 'is-invalid' : ''} ${heldItemRaw ? 'has-held-item' : ''} ${editorMode === 'view' ? 'is-view' : 'is-edit'}`.trim()}
                data-craft-cell="true"
                data-row={rowIndex}
                data-col={colIndex}
                data-item-raw={value || undefined}
                title={tooltipsDisabled ? undefined : title}
                onMouseDown={(event) => startCellPaint(event, rowIndex, colIndex)}
                onMouseEnter={() => {
                  onItemHover?.(value || null);
                  continueCellPaint(rowIndex, colIndex);
                }}
                onMouseOver={() => continueCellPaint(rowIndex, colIndex)}
                onMouseLeave={() => onItemHover?.(null)}
                onFocus={() => onItemHover?.(value || null)}
                onBlur={() => onItemHover?.(null)}
                onMouseUp={stopCellPaint}
                onClick={() => {
                  if (editorMode !== 'view') {
                    onCellClick(rowIndex, colIndex);
                  }
                }}
                onContextMenu={(event) => {
                  if (editorMode === 'view') return;
                  event.preventDefault();
                  onCellContextMenu(rowIndex, colIndex, event);
                }}
                onDragOver={(event) => {
                  if (editorMode !== 'view' && onCellDrop) {
                    event.preventDefault();
                  }
                }}
                onDrop={(event) => {
                  if (editorMode === 'view' || !onCellDrop) return;
                  event.preventDefault();
                  const nextRaw = event.dataTransfer.getData('text/plain');
                  if (nextRaw) {
                    onCellDrop(rowIndex, colIndex, nextRaw);
                  }
                }}
              >
                <div className="cell-visual">
                  <div className="cell-icon-slot" aria-label={`craft-cell-${rowIndex}-${colIndex}`} title={tooltipsDisabled ? undefined : title}>
                    {externalAtlasStyle ? <span className="cell-atlas-icon" style={externalAtlasStyle} aria-hidden="true" /> : null}
                    {atlasStyle ? <span className="cell-atlas-icon" style={atlasStyle} aria-hidden="true" /> : null}
                    {!externalAtlasStyle && !atlasStyle && iconUrl
                      ? <AnimatedIcon iconUrl={iconUrl} alt={title} animated={Boolean(cell.resolution?.animated)} frameTime={cell.resolution?.animation_meta?.frametime ?? 1} animationsEnabled={animationsEnabled} />
                      : null}
                    {!externalAtlasStyle && !atlasStyle && !iconUrl ? <span aria-hidden="true">{isEmpty ? '' : '?'}</span> : null}
                  </div>
                </div>
                <input
                  className="cell-raw-input"
                  aria-label={`cell-${rowIndex}-${colIndex}`}
                  value={value}
                  title={tooltipsDisabled ? undefined : title}
                  readOnly={editorMode === 'view'}
                  onChange={(event) => onCellChange(rowIndex, colIndex, event.target.value)}
                />
                <span className="cell-preview" title={tooltipsDisabled ? undefined : title}>{value ? shortenCellValue(value) : ''}</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
