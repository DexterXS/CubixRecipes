import { useMemo, useState } from 'react';
import { RecipeGrid } from '../components/RecipeGrid';
import { parseText } from '../services/api';
import { CellValue } from '../types';

const defaultMatrix: CellValue[][] = [
  [null, null, null],
  [null, null, null],
  [null, null, null]
];

export default function App() {
  const [input, setInput] = useState('');
  const [matrix, setMatrix] = useState<CellValue[][]>(defaultMatrix);
  const [status, setStatus] = useState('Готово');
  const [strictBinding, setStrictBinding] = useState(true);
  const [metaMode, setMetaMode] = useState('strict');

  const summary = useMemo(() => `${matrix.length}×${matrix[0]?.length ?? 0}`, [matrix]);

  async function handleParse(value: string) {
    setInput(value);
    setStatus('Парсинг...');
    const result = await parseText(value);
    if (result.recipe) {
      setMatrix(result.recipe.matrix.map((row: { raw: CellValue }[]) => row.map((cell) => cell.raw)));
      setStatus('Рецепт загружен');
    } else {
      setStatus('Найден item id');
    }
  }

  return (
    <main>
      <h1>CubixRecipes</h1>
      <textarea
        aria-label="paste-input"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text');
          void handleParse(pasted);
          event.preventDefault();
        }}
      />
      <button onClick={() => void handleParse(input)}>Вставить</button>
      <div>
        <label>
          <input type="checkbox" checked={strictBinding} onChange={() => setStrictBinding((value) => !value)} />
          Жёсткая привязка
        </label>
        <select aria-label="meta-mode" value={metaMode} onChange={(event) => setMetaMode(event.target.value)}>
          <option value="strict">Строгая мета</option>
          <option value="wildcard">Учитывать *</option>
          <option value="ignore">Игнорировать мету</option>
        </select>
      </div>
      <p>{status}</p>
      <p>Размер: {summary}</p>
      <RecipeGrid
        matrix={matrix}
        onCellChange={(row, col, value) => {
          setMatrix((current) => current.map((line, r) => line.map((cell, c) => (r === row && c === col ? (value === 'null' ? null : value) : cell))));
        }}
      />
      <div className="toolbar">
        <button>Сохранить</button>
        <button>Сохранить как</button>
        <button>Создать новый</button>
        <button>Справка</button>
        <button>Вики</button>
      </div>
    </main>
  );
}
