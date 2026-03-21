import { useEffect, useMemo, useState } from 'react';
import { ActionToolbar } from '../components/ActionToolbar';
import { Panel } from '../components/Panel';
import { RecipeGrid } from '../components/RecipeGrid';
import { StatusBar } from '../components/StatusBar';
import { TabNav } from '../components/TabNav';
import { createRecipeTemplate, getProjectSettings, parseText, saveRecipeAs, updateProjectUiPreferences, updateRecipe } from '../services/api';
import { logFrontendEvent } from '../services/debugLog';
import { AppTab, CellValue, DensityMode, DisplayMode, EditorMode, ProjectSettings, RecipeView, SectionKey, UiPreferences } from '../types';

const defaultMatrix: CellValue[][] = [
  [null, null, null],
  [null, null, null],
  [null, null, null]
];

const defaultCollapsed: Record<SectionKey, boolean> = {
  input: false,
  settings: false,
  output: false,
  metadata: false,
  diagnostics: false
};

const defaultUiPreferences: UiPreferences = {
  display_mode: 'text',
  density_mode: 'normal',
  editor_mode: 'edit',
  collapsed_sections: defaultCollapsed
};

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

function normalizeUiPreferences(settings?: ProjectSettings | null): UiPreferences {
  return {
    display_mode: (settings?.ui_preferences?.display_mode ?? 'text') as DisplayMode,
    density_mode: (settings?.ui_preferences?.density_mode ?? 'normal') as DensityMode,
    editor_mode: (settings?.ui_preferences?.editor_mode ?? 'edit') as EditorMode,
    collapsed_sections: {
      ...defaultCollapsed,
      ...(settings?.ui_preferences?.collapsed_sections ?? {})
    }
  };
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
  const [activeTab, setActiveTab] = useState<AppTab>('editor');
  const [saveStatus, setSaveStatus] = useState('Не сохранено');
  const [lastApiStatus, setLastApiStatus] = useState('idle');
  const [lastParseResult, setLastParseResult] = useState('Ещё не выполнялся');
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>(defaultUiPreferences);

  const summary = useMemo(() => `${matrix.length}×${matrix[0]?.length ?? 0}`, [matrix]);
  const outputDisplayName = recipe.output_resolution?.display_name;
  const filledCells = useMemo(() => matrix.flat().filter((cell) => cell && cell !== 'null').length, [matrix]);
  const nullCells = useMemo(() => matrix.flat().filter((cell) => !cell || cell === 'null').length, [matrix]);
  const unresolvedCells = useMemo(() => matrix.flat().filter((cell) => cell && !String(cell).startsWith('<')).length, [matrix]);
  const iconsResolved = recipe.output_resolution?.icon_url ? 1 : 0;
  const iconTotal = filledCells + (outputRaw ? 1 : 0);

  useEffect(() => {
    logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Frontend app mounted', details: { displayMode: metaMode, strictBinding } });
    void (async () => {
      try {
        const nextSettings = await getProjectSettings();
        setSettings(nextSettings);
        setUiPreferences(normalizeUiPreferences(nextSettings));
      } catch {
        setStatus('Не удалось загрузить UI-настройки, используются значения по умолчанию.');
      }
    })();
  }, []);

  useEffect(() => {
    logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Display mode changed', details: { metaMode, strictBinding, uiPreferences } });
  }, [metaMode, strictBinding, uiPreferences]);

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
    }
  }, [recipe.output_resolution?.icon_url, outputDisplayName, outputRaw]);

  async function persistUiPreferences(next: UiPreferences) {
    setUiPreferences(next);
    try {
      const response = await updateProjectUiPreferences(next);
      setSettings(response);
      setSaveStatus('UI-настройки сохранены');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Не удалось сохранить UI-настройки: ${message}`);
    }
  }

  function applyRecipe(nextRecipe: RecipeView, nextInput?: string) {
    setRecipe(nextRecipe);
    setOutputRaw(nextRecipe.output.raw);
    setMatrix(toCellMatrix(nextRecipe));
    setSaveStatus(nextRecipe.source.kind === 'generated' ? 'Черновик' : 'Синхронизировано');
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

  function clearEditor() {
    applyRecipe(defaultRecipe, '');
    setStatus('Интерфейс очищен');
    setSaveStatus('Сброшено');
    setLastApiStatus('idle');
    setLastParseResult('Сброшено');
  }

  async function handleParse(value: string) {
    setInput(value);
    setStatus('Парсинг...');
    setLastApiStatus('pending');
    logFrontendEvent({ level: 'INFO', category: 'UI', message: 'Parse started', details: { input_length: value.length, preview: value.slice(0, 200) } });
    try {
      const result = await parseText(value);
      setLastApiStatus('ok');
      if (result.recipe) {
        applyRecipe(result.recipe, value);
        setStatus('Рецепт загружен');
        setLastParseResult(`Рецепт ${result.recipe.recipe_type}`);
        return;
      }
      if (result.item) {
        setStatus(`Найден item id: ${result.item.raw}`);
        setLastParseResult(`Item ${result.item.raw}`);
        return;
      }
      setStatus('Backend не вернул рецепт или item id');
      setLastParseResult('Пустой ответ');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Ошибка парсинга: ${message}`);
      setLastApiStatus('error');
      setLastParseResult(`Ошибка: ${message}`);
    }
  }

  async function handlePasteFromClipboard() {
    try {
      const pasted = await navigator.clipboard.readText();
      await handleParse(pasted);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Буфер обмена недоступен';
      setStatus(`Не удалось прочитать буфер обмена: ${message}`);
      setLastApiStatus('error');
    }
  }

  async function handleSave() {
    if (recipe.source.kind === 'generated' || recipe.recipe_uid === 'new-recipe') {
      setStatus('Сохранение недоступно: рецепт ещё не существует в .zs файле, используйте «Сохранить как».');
      return;
    }

    setStatus('Сохраняем...');
    setSaveStatus('Сохранение...');
    setLastApiStatus('pending');
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
      setSaveStatus('Сохранено');
      setLastApiStatus('ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Ошибка сохранения: ${message}`);
      setSaveStatus('Ошибка');
      setLastApiStatus('error');
    }
  }

  async function handleSaveAs() {
    const targetPath = window.prompt('Куда сохранить рецепт? Укажите путь к .zs файлу.', recipe.source.path ?? 'scripts/new_recipe.zs');
    if (!targetPath) {
      setStatus('Сохранение как отменено');
      return;
    }

    setStatus('Сохраняем как...');
    setSaveStatus('Сохранение...');
    setLastApiStatus('pending');
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
      setSaveStatus('Сохранено');
      setLastApiStatus('ok');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Ошибка сохранения как: ${message}`);
      setSaveStatus('Ошибка');
      setLastApiStatus('error');
    }
  }

  async function handleCreateNew() {
    setStatus('Создаём шаблон...');
    setLastApiStatus('pending');
    try {
      const created = await createRecipeTemplate({
        templateType: recipe.recipe_type,
        output: outputRaw,
        grid: recipe.recipe_type === 'avaritia_extreme_shaped' ? 9 : 3
      });
      applyRecipe(created, '');
      setStatus('Создан новый шаблон рецепта');
      setLastApiStatus('ok');
      setLastParseResult('Создан новый шаблон');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`Ошибка создания рецепта: ${message}`);
      setLastApiStatus('error');
    }
  }

  function handleOpenWiki() {
    const wikiUrl = new URL('/wiki.html', window.location.origin).toString();
    const openedWindow = window.open(wikiUrl, '_blank', 'noopener,noreferrer');
    if (!openedWindow) {
      window.location.assign(wikiUrl);
    }
    setStatus('Открыта документация');
  }

  function updateCollapsedSection(section: SectionKey) {
    const next = {
      ...uiPreferences,
      collapsed_sections: {
        ...uiPreferences.collapsed_sections,
        [section]: !uiPreferences.collapsed_sections[section]
      }
    };
    void persistUiPreferences(next);
  }

  const statusItems = [
    { label: 'Статус', value: status, tone: status.startsWith('Ошибка') ? 'warning' : 'success' as const },
    { label: 'Тип', value: recipe.recipe_type },
    { label: 'Размер', value: summary },
    { label: 'Сохранение', value: saveStatus },
    { label: 'Иконки', value: `${iconsResolved}/${iconTotal}` },
    { label: 'Режим', value: `${uiPreferences.display_mode} • ${uiPreferences.editor_mode}` }
  ];

  const appClassName = `app-shell density-${uiPreferences.density_mode} mode-${uiPreferences.editor_mode}`;

  return (
    <main className={appClassName}>
      <header className="app-header">
        <div>
          <p className="eyebrow">CubixRecipes</p>
          <h1>Recipe Editor</h1>
          <p className="header-copy">Редактор рецептов с выделенным output, диагностикой и подготовкой под icon/display modes.</p>
        </div>
        <div className="header-summary">
          <div><span>Файл</span><strong>{recipe.source.path ?? 'ещё не сохранён'}</strong></div>
          <div><span>UID</span><strong>{recipe.recipe_uid}</strong></div>
          <div><span>Source</span><strong>{recipe.source.kind}</strong></div>
        </div>
      </header>

      <StatusBar items={statusItems} />
      <ActionToolbar
        onParse={() => void handleParse(input)}
        onPaste={handlePasteFromClipboard}
        onCreateNew={() => void handleCreateNew()}
        onClear={clearEditor}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSaveAs()}
        onHelp={() => setIsHelpOpen(true)}
        onWiki={handleOpenWiki}
      />
      <TabNav value={activeTab} onChange={setActiveTab} />

      <div className="workspace-grid">
        <div className="workspace-left">
          <Panel
            title="Input Text"
            subtitle="Основной источник рецепта. Вставляйте CraftTweaker-блок, парсите его и очищайте при необходимости."
            collapsible
            collapsed={uiPreferences.collapsed_sections.input}
            onToggle={() => updateCollapsedSection('input')}
            actions={<div className="inline-actions"><button type="button" onClick={() => void handleParse(input)}>Parse</button><button type="button" className="ghost-button" onClick={clearEditor}>Очистить всё</button></div>}
          >
            <div className="field-header">
              <span>Исходный текст рецепта</span>
              <div className="inline-actions">
                <button type="button" className="secondary-button" onClick={() => void handlePasteFromClipboard()}>Вставить из буфера</button>
                <button type="button" className="ghost-button" onClick={() => setInput('')}>Очистить input</button>
              </div>
            </div>
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
          </Panel>

          <Panel
            title="Settings"
            subtitle="Компактная панель настроек парсинга и отображения. Сохраняется в общий конфиг проекта."
            collapsible
            collapsed={uiPreferences.collapsed_sections.settings}
            onToggle={() => updateCollapsedSection('settings')}
          >
            <div className="settings-grid">
              <label className="field-block"><span>Strict binding</span><input type="checkbox" checked={strictBinding} onChange={() => setStrictBinding((value) => !value)} /></label>
              <label className="field-block"><span>Meta mode</span><select aria-label="meta-mode" value={metaMode} onChange={(event) => setMetaMode(event.target.value)}><option value="strict">Строгая мета</option><option value="wildcard">Учитывать *</option><option value="ignore">Игнорировать мету</option></select></label>
              <label className="field-block"><span>Display mode</span><select value={uiPreferences.display_mode} onChange={(event) => void persistUiPreferences({ ...uiPreferences, display_mode: event.target.value as DisplayMode })}><option value="text">text</option><option value="icons">icons</option></select></label>
              <label className="field-block"><span>UI density</span><select value={uiPreferences.density_mode} onChange={(event) => void persistUiPreferences({ ...uiPreferences, density_mode: event.target.value as DensityMode })}><option value="compact">compact</option><option value="normal">normal</option><option value="wide">wide</option></select></label>
              <label className="field-block"><span>Editor mode</span><select value={uiPreferences.editor_mode} onChange={(event) => void persistUiPreferences({ ...uiPreferences, editor_mode: event.target.value as EditorMode })}><option value="view">view</option><option value="edit">edit</option></select></label>
            </div>
          </Panel>

          <Panel
            title="Выход"
            subtitle="Главный результат рецепта: display name, raw id, icon status и подготовка под будущий icon mode."
            collapsible
            collapsed={uiPreferences.collapsed_sections.output}
            onToggle={() => updateCollapsedSection('output')}
          >
            <div className="output-card">
              <div className="output-icon-slot">{uiPreferences.display_mode === 'icons' && recipe.output_resolution?.icon_url ? <img src={recipe.output_resolution.icon_url} alt={outputDisplayName ?? outputRaw} /> : <span>?</span>}</div>
              <div className="output-details">
                <div className="output-title-row">
                  <h3>{outputDisplayName ?? 'Неразрешённый output'}</h3>
                  <span className={`badge ${recipe.output_resolution?.icon_url ? 'badge-success' : 'badge-warning'}`}>{recipe.output_resolution?.icon_url ? 'Icon ready' : 'Fallback placeholder'}</span>
                </div>
                <label className="field-block">
                  <span>Raw output</span>
                  <input
                    aria-label="output-raw"
                    type="text"
                    value={outputRaw}
                    onChange={(event) => {
                      const value = event.target.value;
                      setOutputRaw(value);
                      setRecipe((current) => ({ ...current, output: { ...current.output, raw: value } }));
                    }}
                  />
                </label>
                <div className="kv-grid">
                  <div><span>Display name</span><strong>{outputDisplayName ?? 'пока не разрешено'}</strong></div>
                  <div><span>Raw id</span><strong>{outputRaw || '—'}</strong></div>
                  <div><span>Icon status</span><strong>{recipe.output_resolution?.icon_url ?? 'пока не найдена'}</strong></div>
                  <div><span>Resolution strategy</span><strong>{recipe.output_resolution?.strategy ?? 'n/a'}</strong></div>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="workspace-center">
          <Panel
            title="Input Grid"
            subtitle={`Центральная рабочая зона рецепта. Размер ${summary}, автоплотность под 3×3 / 5×5 / 9×9.`}
            className="grid-panel"
          >
            <div className="grid-meta"><span>Размер</span><strong>{summary}</strong><span>Заполнено</span><strong>{filledCells}</strong><span>Пусто</span><strong>{nullCells}</strong></div>
            <div className="grid-scroll-zone">
              <RecipeGrid
                matrix={matrix}
                displayMode={uiPreferences.display_mode}
                editorMode={uiPreferences.editor_mode}
                onCellChange={(row, col, value) => {
                  setMatrix((current) => current.map((line, r) => line.map((cell, c) => (r === row && c === col ? (value === 'null' || value === '' ? null : value) : cell))));
                  setSaveStatus('Есть несохранённые изменения');
                }}
              />
            </div>
          </Panel>
        </div>

        <aside className="workspace-right">
          <Panel
            title="Recipe Info"
            subtitle="Текущее состояние рецепта, путь, UID и summary по ячейкам."
            collapsible
            collapsed={uiPreferences.collapsed_sections.metadata}
            onToggle={() => updateCollapsedSection('metadata')}
          >
            <div className="kv-grid">
              <div><span>Recipe type</span><strong>{recipe.recipe_type}</strong></div>
              <div><span>Source file</span><strong>{recipe.source.path ?? '—'}</strong></div>
              <div><span>Recipe UID</span><strong>{recipe.recipe_uid}</strong></div>
              <div><span>Parsed cells</span><strong>{filledCells}</strong></div>
              <div><span>Null cells</span><strong>{nullCells}</strong></div>
              <div><span>Warnings</span><strong>{unresolvedCells}</strong></div>
              <div><span>Save status</span><strong>{saveStatus}</strong></div>
              <div><span>Output state</span><strong>{recipe.output_resolution?.display_name ? 'resolved' : 'unresolved'}</strong></div>
              <div><span>Origin / source path</span><strong>{recipe.source.path ?? settings?.project_config_path ?? '—'}</strong></div>
            </div>
          </Panel>

          <Panel
            title="Quick Debug"
            subtitle="Краткий frontend debug без открытия Control Panel."
            collapsible
            collapsed={uiPreferences.collapsed_sections.diagnostics}
            onToggle={() => updateCollapsedSection('diagnostics')}
          >
            <div className="kv-grid">
              <div><span>Last API status</span><strong>{lastApiStatus}</strong></div>
              <div><span>Last parse result</span><strong>{lastParseResult}</strong></div>
              <div><span>Output resolved</span><strong>{recipe.output_resolution?.display_name ? 'yes' : 'no'}</strong></div>
              <div><span>Icon found</span><strong>{recipe.output_resolution?.icon_url ? 'yes' : 'no'}</strong></div>
              <div><span>Display mode</span><strong>{uiPreferences.display_mode}</strong></div>
              <div><span>Config sources</span><strong>{(settings?.extra_icon_sources.length ?? 0) + (settings?.extra_recipe_sources.length ?? 0)}</strong></div>
            </div>
          </Panel>

          {activeTab === 'raw' ? (
            <Panel title="Raw" subtitle="Сырой текст текущего рецепта и output metadata для ручной проверки.">
              <pre className="raw-block">{JSON.stringify({ recipe, matrix, settings: settings?.ui_preferences }, null, 2)}</pre>
            </Panel>
          ) : null}
          {activeTab === 'diagnostics' ? (
            <Panel title="Diagnostics" subtitle="Дополнительный diagnostic summary по текущему состоянию редактора.">
              <ul className="diagnostics-list">
                <li>Unresolved cells: {unresolvedCells}</li>
                <li>Output icon: {recipe.output_resolution?.icon_url ?? 'not found'}</li>
                <li>Current file: {recipe.source.path ?? 'unsaved'}</li>
                <li>Current UID: {recipe.recipe_uid}</li>
              </ul>
            </Panel>
          ) : null}
          {activeTab === 'preview' ? (
            <Panel title="Preview" subtitle="Быстрый обзор output и metadata в режиме просмотра.">
              <div className="preview-block">
                <strong>{outputDisplayName ?? outputRaw}</strong>
                <span>{recipe.recipe_type}</span>
                <span>{summary}</span>
              </div>
            </Panel>
          ) : null}
        </aside>
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
