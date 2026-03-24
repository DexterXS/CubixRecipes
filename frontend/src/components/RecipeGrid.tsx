import { AnimatedIcon } from './AnimatedIcon';
import { CellValue, DisplayMode, EditorMode, ResolutionView } from '../types';

interface Props {
  matrix: { raw: CellValue; resolution?: ResolutionView | null }[][];
  displayMode: DisplayMode;
  editorMode: EditorMode;
  onCellChange: (row: number, col: number, value: string) => void;
  resolveCellTitle: (raw: string) => string;
  onIconClick: () => void;
}

function shortenCellValue(value: string): string {
  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
}

export function RecipeGrid({ matrix, displayMode, editorMode, onCellChange, resolveCellTitle, onIconClick }: Props) {
  const size = Math.max(matrix.length, matrix[0]?.length ?? 0, 1);
  const cellClass = size >= 9 ? 'grid-cell size-9' : size >= 5 ? 'grid-cell size-5' : 'grid-cell size-3';

  return (
    <div className="grid-wrap" data-grid-size={size}>
      {matrix.map((row, rowIndex) => (
        <div key={rowIndex} className="grid-row">
          {row.map((cell, colIndex) => {
            const raw = cell?.raw ?? null;
            const isEmpty = raw === null || raw === '' || raw === 'null';
            const isInvalid = !isEmpty && !String(raw).startsWith('<');
            const value = isEmpty ? '' : String(raw);
            const placeholder = displayMode === 'icons' ? '?' : '∅';
            const iconUrl = cell?.resolution?.icon_url ?? null;
            const title = value ? resolveCellTitle(value) : 'Пустая ячейка';

            return (
              <label
                key={`${rowIndex}-${colIndex}`}
                className={`${cellClass} ${isEmpty ? 'is-empty' : 'is-filled'} ${isInvalid ? 'is-invalid' : ''} ${editorMode === 'view' ? 'is-view' : 'is-edit'}`.trim()}
                title={title}
              >
                <span className="cell-coord">{rowIndex + 1},{colIndex + 1}</span>
                <button type="button" className="cell-icon-slot" aria-label="open-craft-editor" title={title} onClick={onIconClick}>
                  {displayMode === 'icons' && iconUrl
                    ? <AnimatedIcon iconUrl={iconUrl} alt={title} animated={Boolean(cell.resolution?.animated)} frameTime={cell.resolution?.animation_meta?.frametime ?? 1} />
                    : <span aria-hidden="true">{displayMode === 'icons' ? '?' : '□'}</span>}
                </button>
                <input
                  aria-label={`cell-${rowIndex}-${colIndex}`}
                  value={value}
                  placeholder={placeholder}
                  readOnly={editorMode === 'view'}
                  onChange={(event) => onCellChange(rowIndex, colIndex, event.target.value)}
                />
                <span className="cell-preview">{value ? shortenCellValue(value) : 'empty'}</span>
              </label>
            );
          })}
        </div>
      ))}
    </div>
  );
}
