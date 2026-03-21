import { CellValue, DisplayMode, EditorMode } from '../types';

interface Props {
  matrix: CellValue[][];
  displayMode: DisplayMode;
  editorMode: EditorMode;
  onCellChange: (row: number, col: number, value: string) => void;
}

function shortenCellValue(value: string): string {
  return value.length > 14 ? `${value.slice(0, 12)}…` : value;
}

export function RecipeGrid({ matrix, displayMode, editorMode, onCellChange }: Props) {
  const size = Math.max(matrix.length, matrix[0]?.length ?? 0, 1);
  const cellClass = size >= 9 ? 'grid-cell size-9' : size >= 5 ? 'grid-cell size-5' : 'grid-cell size-3';

  return (
    <div className="grid-wrap" data-grid-size={size}>
      {matrix.map((row, rowIndex) => (
        <div key={rowIndex} className="grid-row">
          {row.map((cell, colIndex) => {
            const isEmpty = cell === null || cell === '' || cell === 'null';
            const isInvalid = !isEmpty && !String(cell).startsWith('<');
            const value = isEmpty ? '' : String(cell);
            const placeholder = displayMode === 'icons' ? '?' : '∅';

            return (
              <label
                key={`${rowIndex}-${colIndex}`}
                className={`${cellClass} ${isEmpty ? 'is-empty' : 'is-filled'} ${isInvalid ? 'is-invalid' : ''} ${editorMode === 'view' ? 'is-view' : 'is-edit'}`.trim()}
                title={value || 'Пустая ячейка'}
              >
                <span className="cell-coord">{rowIndex + 1},{colIndex + 1}</span>
                <span className="cell-icon-slot" aria-hidden="true">{displayMode === 'icons' ? '?' : '□'}</span>
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
