import { CellValue } from '../types';

interface Props {
  matrix: CellValue[][];
  onCellChange: (row: number, col: number, value: string) => void;
}

export function RecipeGrid({ matrix, onCellChange }: Props) {
  return (
    <div className="grid-wrap">
      {matrix.map((row, rowIndex) => (
        <div key={rowIndex} className="grid-row">
          {row.map((cell, colIndex) => (
            <input
              key={`${rowIndex}-${colIndex}`}
              aria-label={`cell-${rowIndex}-${colIndex}`}
              value={cell ?? 'null'}
              onChange={(event) => onCellChange(rowIndex, colIndex, event.target.value)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
