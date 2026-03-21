import { useMemo, useState } from 'react';
import { RecipeGrid } from '../components/RecipeGrid';
import { createRecipeTemplate, parseText, saveRecipeAs, updateRecipe } from '../services/api';
import { CellValue, RecipeView } from '../types';

const defaultMatrix: CellValue[][] = [
  [null, null, null],
  [null, null, null],
  [null, null, null]
];

const defaultRecipe: RecipeView = {
  recipe_uid: 'new-recipe',
  recipe_type: 'ct_shaped',
  name: null,
  output: { raw: '<minecraft:stone>' },
  grid_w: 3,
  grid_h: 3,
  matrix: defaultMatrix.map((row) => row.map((cell) => ({ raw: cell }))),
  source: { kind: 'generated', path: null }
};

const helpText = [
  'Вставьте `recipes.addShaped(...)` или `mods.avaritia.ExtremeCrafting.addShaped(...)` в верхнее поле.',
  'Кнопка «Вставить» отправляет текст в backend `/api/parse` и заполняет сетку рецепта.',
  '«Сохранить» обновляет исходный `.zs` файл для уже существующего рецепта.',
  '«Сохранить как» добавляет текущий рецепт в другой `.zs` файл через backend save-as endpoint.',
  '«Создать новый» запрашивает backend шаблон нового рецепта и сбрасывает сетку.'
];

function cloneMatrix(matrix: CellValue[][]): CellValue[][] {
  return matrix.map((row) => [...row]);
}

function toCellMatrix(recipe: RecipeView): CellValue[][] {
  return recipe.matrix.map((row) => row.map((cell) => cell.raw));
}

export default function App() {
  const [input, setInput] = useState('');
  const [matrix, setMatrix] = useState<CellValue[][]>(cloneMatrix(defaultMatrix));
  const [status, setStatus] = useState('Готово');
  const [strictBinding, setStrictBinding] = useState(true);
  const [metaMode, setMetaMode] = useState('strict');
  const [recipe, setRecipe] = useState<RecipeView>(defaultRecipe);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const summary = useMemo(() => `${matrix.length}×${matrix[0]?.length ?? 0}`, [matrix]);

  function applyRecipe(nextRecipe: RecipeView, nextInput?: string) {
    setRecipe(nextRecipe);
    setMatrix(toCellMatrix(nextRecipe));
    if (nextInput !== undefined) {
      setInput(nextInput);
    }
  }

  async function handleParse(value: string) {
    setInput(value);
    setStatus('Парсинг...');
    try {
      const result = await parseText(value);
      if (result.recipe) {
        applyRecipe(result.recipe, value);
        setStatus('Рецепт загружен');
        return;
      }
      if (result.item) {
        setStatus(`Найден item id: ${result.item.raw}`);
        return;
      }
      setStatus('Backend не вернул рецепт или item id');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Ошибка парсинга: ${message}`);
    }
  }

  async function handleSave() {
    if (recipe.source.kind === 'generated' || recipe.recipe_uid === 'new-recipe') {
      setStatus('Сохранение недоступно: рецепт ещё не существует в .zs файле, используйте «Сохранить как».');
      return;
    }

    setStatus('Сохраняем...');
    try {
      const updated = await updateRecipe({
        recipeUid: recipe.recipe_uid,
        recipeType: recipe.recipe_type,
        outputRaw: recipe.output.raw,
        matrix,
        name: recipe.name
      });
      applyRecipe(updated.updatedRecipe, input);
      setStatus('Рецепт сохранён');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Ошибка сохранения: ${message}`);
    }
  }

  async function handleSaveAs() {
    const targetPath = window.prompt('Куда сохранить рецепт? Укажите путь к .zs файлу.', recipe.source.path ?? 'scripts/new_recipe.zs');
    if (!targetPath) {
      setStatus('Сохранение как отменено');
      return;
    }

    setStatus('Сохраняем как...');
    try {
      if (recipe.recipe_uid === 'new-recipe') {
        const created = await createRecipeTemplate({
          templateType: recipe.recipe_type,
          output: recipe.output.raw,
          grid: matrix.length
        });
        const response = await saveRecipeAs({
          recipeUid: created.recipe_uid,
          recipeType: created.recipe_type,
          outputRaw: created.output.raw,
          matrix,
          name: created.name,
          targetPath
        });
        applyRecipe(response.recipe, input);
      } else {
        const response = await saveRecipeAs({
          recipeUid: recipe.recipe_uid,
          recipeType: recipe.recipe_type,
          outputRaw: recipe.output.raw,
          matrix,
          name: recipe.name,
          targetPath
        });
        applyRecipe(response.recipe, input);
      }
      setStatus(`Рецепт сохранён в ${targetPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Ошибка сохранения как: ${message}`);
    }
  }

  async function handleCreateNew() {
    setStatus('Создаём шаблон...');
    try {
      const created = await createRecipeTemplate({
        templateType: recipe.recipe_type,
        output: recipe.output.raw,
        grid: recipe.recipe_type === 'avaritia_extreme_shaped' ? 9 : 3
      });
      applyRecipe(created, '');
      setStatus('Создан новый шаблон рецепта');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Ошибка создания рецепта: ${message}`);
    }
  }

  function handleOpenWiki() {
    window.open('/wiki.html', '_blank', 'noopener,noreferrer');
    setStatus('Открыта документация');
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
        <button onClick={() => void handleSave()}>Сохранить</button>
        <button onClick={() => void handleSaveAs()}>Сохранить как</button>
        <button onClick={() => void handleCreateNew()}>Создать новый</button>
        <button onClick={() => setIsHelpOpen(true)}>Справка</button>
        <button onClick={handleOpenWiki}>Вики</button>
      </div>
      {isHelpOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsHelpOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label="Справка" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>Справка</h2>
              <button type="button" onClick={() => setIsHelpOpen(false)}>Закрыть</button>
            </div>
            <ul>
              {helpText.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </main>
  );
}
