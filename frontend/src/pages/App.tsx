import { useEffect, useMemo, useState } from 'react';
import { RecipeGrid } from '../components/RecipeGrid';
import { createRecipeTemplate, parseText, saveRecipeAs, updateRecipe } from '../services/api';
import { logFrontendEvent } from '../services/debugLog';
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
  output_resolution: null,
  grid_w: 3,
  grid_h: 3,
  matrix: defaultMatrix.map((row) => row.map((cell) => ({ raw: cell }))),
  source: { kind: 'generated', path: null }
};

const helpText = [
  'Вставьте `recipes.addShaped(...)` или `mods.avaritia.ExtremeCrafting.addShaped(...)` в верхнее поле.',
  'Кнопка «Вставить» отправляет текст в backend `/api/parse` и заполняет сетку рецепта.',
  'Блок «Выход» показывает результат крафта и позволяет редактировать raw item id перед сохранением.',
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
  const [outputRaw, setOutputRaw] = useState(defaultRecipe.output.raw);
  const [isHelpOpen, setIsHelpOpen] = useState(false);

  const summary = useMemo(() => `${matrix.length}×${matrix[0]?.length ?? 0}`, [matrix]);
  const outputDisplayName = recipe.output_resolution?.display_name;

  useEffect(() => {
    logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Frontend app mounted', details: { displayMode: metaMode, strictBinding } });
  }, []);

  useEffect(() => {
    logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Display mode changed', details: { metaMode, strictBinding } });
  }, [metaMode, strictBinding]);

  useEffect(() => {
    if (!recipe.output_resolution?.icon_url) {
      logFrontendEvent({
        level: 'WARN',
        category: 'ICON',
        message: 'Using placeholder for output icon',
        details: {
          raw_item_id: outputRaw,
          display_name: outputDisplayName,
          reason: 'icon_url missing in output_resolution',
          placeholder: true
        }
      });
    } else {
      logFrontendEvent({
        level: 'INFO',
        category: 'ICON',
        message: 'Output icon resolved in frontend',
        details: { raw_item_id: outputRaw, icon_url: recipe.output_resolution.icon_url, strategy: recipe.output_resolution.strategy },
        verbose_only: true
      });
    }
  }, [recipe.output_resolution?.icon_url, recipe.output_resolution?.strategy, outputDisplayName, outputRaw]);

  function applyRecipe(nextRecipe: RecipeView, nextInput?: string) {
    setRecipe(nextRecipe);
    setOutputRaw(nextRecipe.output.raw);
    setMatrix(toCellMatrix(nextRecipe));
    logFrontendEvent({
      level: 'INFO',
      category: 'UI',
      message: 'Recipe applied to frontend state',
      details: { recipe_uid: nextRecipe.recipe_uid, recipe_type: nextRecipe.recipe_type, source_path: nextRecipe.source.path, output: nextRecipe.output.raw }
    });
    if (nextInput !== undefined) {
      setInput(nextInput);
    }
  }

  async function handleParse(value: string) {
    setInput(value);
    setStatus('Парсинг...');
    logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Parse started', details: { input_length: value.length, preview: value.slice(0, 200) } });
    try {
      const result = await parseText(value);
      if (result.recipe) {
        applyRecipe(result.recipe, value);
        setStatus('Рецепт загружен');
        logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Parse completed with recipe', details: { output: result.recipe.output.raw, grid: `${result.recipe.grid_w}x${result.recipe.grid_h}` } });
        return;
      }
      if (result.item) {
        setStatus(`Найден item id: ${result.item.raw}`);
        logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Parse completed with item query', details: { item_raw: result.item.raw } });
        return;
      }
      setStatus('Backend не вернул рецепт или item id');
      logFrontendEvent({ level: 'WARN', category: 'UI', message: 'Parse returned no recipe or item', details: {} });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Ошибка парсинга: ${message}`);
      logFrontendEvent({ level: 'ERROR', category: 'UI', message: 'Parse failed in frontend', details: { error: message, input_length: value.length } });
    }
  }

  async function handleSave() {
    logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Save button clicked', details: { recipe_uid: recipe.recipe_uid, outputRaw } });
    if (recipe.source.kind === 'generated' || recipe.recipe_uid === 'new-recipe') {
      setStatus('Сохранение недоступно: рецепт ещё не существует в .zs файле, используйте «Сохранить как».');
      logFrontendEvent({ level: 'WARN', category: 'UI', message: 'Save blocked for generated recipe', details: { recipe_uid: recipe.recipe_uid, source_kind: recipe.source.kind } });
      return;
    }

    setStatus('Сохраняем...');
    try {
      const updated = await updateRecipe({
        recipeUid: recipe.recipe_uid,
        recipeType: recipe.recipe_type,
        outputRaw,
        matrix,
        name: recipe.name
      });
      applyRecipe(updated.updatedRecipe, input);
      setStatus('Рецепт сохранён');
      logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Save completed', details: { recipe_uid: updated.updatedRecipe.recipe_uid } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Ошибка сохранения: ${message}`);
      logFrontendEvent({ level: 'ERROR', category: 'UI', message: 'Save failed', details: { error: message } });
    }
  }

  async function handleSaveAs() {
    const targetPath = window.prompt('Куда сохранить рецепт? Укажите путь к .zs файлу.', recipe.source.path ?? 'scripts/new_recipe.zs');
    if (!targetPath) {
      setStatus('Сохранение как отменено');
      logFrontendEvent({ level: 'WARN', category: 'UI', message: 'Save as cancelled by user', details: {} });
      return;
    }

    setStatus('Сохраняем как...');
    logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Save as started', details: { targetPath, recipe_uid: recipe.recipe_uid } });
    try {
      if (recipe.recipe_uid === 'new-recipe') {
        const created = await createRecipeTemplate({
          templateType: recipe.recipe_type,
          output: outputRaw,
          grid: matrix.length
        });
        const response = await saveRecipeAs({
          recipeUid: created.recipe_uid,
          recipeType: created.recipe_type,
          outputRaw,
          matrix,
          name: created.name,
          targetPath
        });
        applyRecipe(response.recipe, input);
      } else {
        const response = await saveRecipeAs({
          recipeUid: recipe.recipe_uid,
          recipeType: recipe.recipe_type,
          outputRaw,
          matrix,
          name: recipe.name,
          targetPath
        });
        applyRecipe(response.recipe, input);
      }
      setStatus(`Рецепт сохранён в ${targetPath}`);
      logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Save as completed', details: { targetPath } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Ошибка сохранения как: ${message}`);
      logFrontendEvent({ level: 'ERROR', category: 'UI', message: 'Save as failed', details: { error: message, targetPath } });
    }
  }

  async function handleCreateNew() {
    setStatus('Создаём шаблон...');
    logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Create new recipe clicked', details: { recipe_type: recipe.recipe_type, outputRaw } });
    try {
      const created = await createRecipeTemplate({
        templateType: recipe.recipe_type,
        output: outputRaw,
        grid: recipe.recipe_type === 'avaritia_extreme_shaped' ? 9 : 3
      });
      applyRecipe(created, '');
      setStatus('Создан новый шаблон рецепта');
      logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Create new recipe completed', details: { recipe_uid: created.recipe_uid } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Ошибка создания рецепта: ${message}`);
      logFrontendEvent({ level: 'ERROR', category: 'UI', message: 'Create new recipe failed', details: { error: message } });
    }
  }

  function handleOpenWiki() {
    window.open('/wiki.html', '_blank', 'noopener,noreferrer');
    setStatus('Открыта документация');
    logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Wiki opened', details: {} });
  }

  return (
    <main>
      <h1>CubixRecipes</h1>
      <textarea
        aria-label="paste-input"
        value={input}
        onChange={(event) => {
          setInput(event.target.value);
          logFrontendEvent({ level: 'DEBUG', category: 'UI', message: 'Input changed', details: { length: event.target.value.length }, verbose_only: true });
        }}
        onPaste={(event) => {
          const pasted = event.clipboardData.getData('text');
          logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Text pasted into input', details: { length: pasted.length, preview: pasted.slice(0, 200) } });
          void handleParse(pasted);
          event.preventDefault();
        }}
      />
      <button onClick={() => void handleParse(input)}>Вставить</button>
      <div>
        <label>
          <input
            type="checkbox"
            checked={strictBinding}
            onChange={() => {
              setStrictBinding((value) => !value);
            }}
          />
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
      <section aria-label="recipe-output">
        <h2>Выход</h2>
        <label>
          Raw output
          <input
            aria-label="output-raw"
            type="text"
            value={outputRaw}
            onChange={(event) => {
              const value = event.target.value;
              setOutputRaw(value);
              setRecipe((current) => ({ ...current, output: { ...current.output, raw: value } }));
              logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Output changed', details: { outputRaw: value } });
            }}
          />
        </label>
        <p>Текущее значение: <code>{outputRaw || '—'}</code></p>
        <p>Имя: {outputDisplayName ?? 'пока не разрешено'}</p>
        <p>Иконка: {recipe.output_resolution?.icon_url ?? 'пока не найдена'}</p>
      </section>
      <RecipeGrid
        matrix={matrix}
        onCellChange={(row, col, value) => {
          setMatrix((current) => current.map((line, r) => line.map((cell, c) => (r === row && c === col ? (value === 'null' ? null : value) : cell))));
          logFrontendEvent({ level: 'DEBUG', category: 'UI', message: 'Recipe cell changed', details: { row, col, value }, verbose_only: true });
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
