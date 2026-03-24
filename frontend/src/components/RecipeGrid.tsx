import { AnimatedIcon } from './AnimatedIcon';
import { CellValue, DisplayMode, EditorMode, ResolutionView } from '../types';

interface Props {
  matrix: { raw: CellValue; resolution?: ResolutionView | null }[][];
  displayMode: DisplayMode;
  editorMode: EditorMode;
  animateIcons: boolean;
  onCellChange: (row: number, col: number, value: string) => void;
  onCellCopy: (row: number, col: number) => void;
  onCellPaste: (row: number, col: number) => void;
  onCellClear: (row: number, col: number) => void;
  resolveCellTitle: (raw: string) => string;
  onIconClick: (row: number, col: number) => void;
}

export function RecipeGrid({ matrix, displayMode, editorMode, animateIcons, onCellChange, onCellCopy, onCellPaste, onCellClear, resolveCellTitle, onIconClick }: Props) {
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
            const resolverTitle = cell?.resolution?.display_name?.trim();
            const localizedTitle = value ? resolveCellTitle(value) : '';
            const isBlockLike = /(^|[:_./-])block([:_./-]|$)/i.test(value);
            const title = value
              ? (localizedTitle && localizedTitle !== value
                ? localizedTitle
                : (resolverTitle && resolverTitle !== value && !resolverTitle.startsWith('<') ? resolverTitle : value))
              : 'Пустая ячейка';

            return (
              <div
                key={`${rowIndex}-${colIndex}`}
                className={`${cellClass} ${isEmpty ? 'is-empty' : 'is-filled'} ${isInvalid ? 'is-invalid' : ''} ${editorMode === 'view' ? 'is-view' : 'is-edit'}`.trim()}
                title={title}
              >
                <button type="button" className="cell-icon-slot" aria-label={`open-craft-editor-${rowIndex}-${colIndex}`} title={title} onClick={() => onIconClick(rowIndex, colIndex)}>
                  {displayMode === 'icons' && iconUrl
                    ? <AnimatedIcon iconUrl={iconUrl} alt={title} animated={Boolean(cell.resolution?.animated)} frameTime={cell.resolution?.animation_meta?.frametime ?? 1} block3d={isBlockLike && !cell.resolution?.animated} enableAnimation={animateIcons} />
                    : <span aria-hidden="true">{displayMode === 'icons' ? '?' : '□'}</span>}
                </button>
                <div className="cell-mini-actions">
                  <button type="button" aria-label={`copy-cell-${rowIndex}-${colIndex}`} className="cell-mini-button" title="Копировать" onClick={() => onCellCopy(rowIndex, colIndex)}>⧉</button>
                  <button type="button" aria-label={`paste-cell-${rowIndex}-${colIndex}`} className="cell-mini-button" title="Вставить" onClick={() => onCellPaste(rowIndex, colIndex)}>⎘</button>
                  <button type="button" aria-label={`clear-cell-${rowIndex}-${colIndex}`} className="cell-mini-button" title="Очистить" onClick={() => onCellClear(rowIndex, colIndex)}>⌫</button>
                </div>
                {editorMode === 'edit' ? (
                  <input
                    aria-label={`cell-${rowIndex}-${colIndex}`}
                    value={value}
                    title={title}
                    placeholder={placeholder}
                    readOnly={editorMode === 'view'}
                    onChange={(event) => onCellChange(rowIndex, colIndex, event.target.value)}
                    className="cell-hidden-input"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
