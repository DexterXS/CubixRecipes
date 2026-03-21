import { useEffect, useMemo, useState } from 'react';
import { ActionToolbar } from '../components/ActionToolbar';
import { Panel } from '../components/Panel';
import { RecipeGrid } from '../components/RecipeGrid';
import { StatusBar } from '../components/StatusBar';
import { TabNav } from '../components/TabNav';
import { createTranslator, getHelpItems, getPanelLabel, getTabLabel } from '../i18n';
import { createRecipeTemplate, getProjectSettings, parseText, saveRecipeAs, updateProjectUiPreferences, updateRecipe } from '../services/api';
import { logFrontendEvent } from '../services/debugLog';
import { AppTab, CellValue, DensityMode, DisplayMode, EditorMode, PanelId, PanelLayoutItem, PanelZone, ProjectSettings, RecipeView, UiLanguage, UiPreferences } from '../types';

const defaultMatrix: CellValue[][] = [
  [null, null, null],
  [null, null, null],
  [null, null, null]
];

const defaultPanelLayout: PanelLayoutItem[] = [
  { id: 'input', zone: 'topLeft', order: 0, visible: true },
  { id: 'output', zone: 'topRight', order: 0, visible: true },
  { id: 'grid', zone: 'bottom', order: 0, visible: true },
  { id: 'settings', zone: 'bottom', order: 1, visible: true },
  { id: 'info', zone: 'sidebar', order: 0, visible: true },
  { id: 'debug', zone: 'sidebar', order: 1, visible: true },
  { id: 'diagnostics', zone: 'sidebar', order: 2, visible: true },
  { id: 'preview', zone: 'sidebar', order: 3, visible: false },
  { id: 'raw', zone: 'sidebar', order: 4, visible: false }
];

const allPanelIds: PanelId[] = defaultPanelLayout.map((panel) => panel.id);
const orderedZones: PanelZone[] = ['topLeft', 'topRight', 'bottom', 'sidebar'];

const defaultUiPreferences: UiPreferences = {
  display_mode: 'text',
  density_mode: 'normal',
  editor_mode: 'edit',
  language: 'ru',
  active_view_tab: 'editor',
  reset_layout_version: 2,
  panel_layout: defaultPanelLayout
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

function cloneMatrix(matrix: CellValue[][]): CellValue[][] {
  return matrix.map((row) => [...row]);
}

function toCellMatrix(recipe: RecipeView): CellValue[][] {
  return recipe.matrix.map((row) => row.map((cell) => cell.raw));
}

function normalizePanelLayout(rawLayout?: PanelLayoutItem[] | null): PanelLayoutItem[] {
  const result = rawLayout && rawLayout.length ? rawLayout.map((item) => ({ ...item })) : [];
  const seen = new Set(result.map((item) => item.id));
  defaultPanelLayout.forEach((item) => {
    if (!seen.has(item.id)) {
      result.push({ ...item });
    }
  });
  return result
    .map((item, index) => ({
      id: item.id,
      zone: orderedZones.includes(item.zone) ? item.zone : 'bottom',
      order: Number.isFinite(item.order) ? item.order : index,
      visible: item.visible !== false
    }))
    .sort((left, right) => left.order - right.order);
}

function normalizeUiPreferences(settings?: ProjectSettings | null): UiPreferences {
  const source = settings?.ui_preferences;
  return {
    display_mode: (source?.display_mode ?? 'text') as DisplayMode,
    density_mode: (source?.density_mode ?? 'normal') as DensityMode,
    editor_mode: (source?.editor_mode ?? 'edit') as EditorMode,
    language: (source?.language ?? 'ru') as UiLanguage,
    active_view_tab: (source?.active_view_tab ?? 'editor') as AppTab,
    reset_layout_version: source?.reset_layout_version ?? 2,
    panel_layout: normalizePanelLayout(source?.panel_layout)
  };
}

function updatePanelLayout(layout: PanelLayoutItem[], panelId: PanelId, updater: (panel: PanelLayoutItem) => PanelLayoutItem): PanelLayoutItem[] {
  return layout.map((panel) => (panel.id === panelId ? updater(panel) : panel));
}

function reorderWithinZone(layout: PanelLayoutItem[], panelId: PanelId, direction: -1 | 1): PanelLayoutItem[] {
  const target = layout.find((item) => item.id === panelId);
  if (!target) {
    return layout;
  }
  const zoneItems = layout.filter((item) => item.zone === target.zone).sort((a, b) => a.order - b.order);
  const index = zoneItems.findIndex((item) => item.id === panelId);
  const swapIndex = index + direction;
  if (index < 0 || swapIndex < 0 || swapIndex >= zoneItems.length) {
    return layout;
  }
  const reordered = [...zoneItems];
  [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
  return layout.map((item) => {
    const updatedIndex = reordered.findIndex((entry) => entry.id === item.id);
    return updatedIndex >= 0 ? { ...item, order: updatedIndex } : item;
  });
}

function movePanelToZone(layout: PanelLayoutItem[], panelId: PanelId, step: -1 | 1): PanelLayoutItem[] {
  const target = layout.find((item) => item.id === panelId);
  if (!target) {
    return layout;
  }
  const zoneIndex = orderedZones.indexOf(target.zone);
  const nextZone = orderedZones[(zoneIndex + step + orderedZones.length) % orderedZones.length];
  const nextOrder = layout.filter((item) => item.zone === nextZone).length;
  return updatePanelLayout(layout, panelId, (panel) => ({ ...panel, zone: nextZone, order: nextOrder, visible: true }));
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
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState('Не сохранено');
  const [lastApiStatus, setLastApiStatus] = useState('idle');
  const [lastParseResult, setLastParseResult] = useState('Ещё не выполнялся');
  const [settings, setSettings] = useState<ProjectSettings | null>(null);
  const [uiPreferences, setUiPreferences] = useState<UiPreferences>(defaultUiPreferences);

  const t = createTranslator(uiPreferences.language);
  const summary = useMemo(() => `${matrix.length}×${matrix[0]?.length ?? 0}`, [matrix]);
  const outputDisplayName = recipe.output_resolution?.display_name;
  const filledCells = useMemo(() => matrix.flat().filter((cell) => cell && cell !== 'null').length, [matrix]);
  const nullCells = useMemo(() => matrix.flat().filter((cell) => !cell || cell === 'null').length, [matrix]);
  const unresolvedCells = useMemo(() => matrix.flat().filter((cell) => cell && !String(cell).startsWith('<')).length, [matrix]);
  const iconsResolved = recipe.output_resolution?.icon_url ? 1 : 0;
  const iconTotal = filledCells + (outputRaw ? 1 : 0);

  useEffect(() => {
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

  async function persistUiPreferences(next: UiPreferences) {
    setUiPreferences(next);
    try {
      const response = await updateProjectUiPreferences(next);
      setSettings(response);
      setSaveStatus(t('status.uiSaved'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`${t('status.saveError')}: ${message}`);
    }
  }

  function patchUiPreferences(patch: Partial<UiPreferences>) {
    const next = { ...uiPreferences, ...patch };
    void persistUiPreferences(next);
  }

  function patchPanelLayout(nextLayout: PanelLayoutItem[]) {
    void persistUiPreferences({ ...uiPreferences, panel_layout: normalizePanelLayout(nextLayout) });
  }

  function applyRecipe(nextRecipe: RecipeView, nextInput?: string) {
    setRecipe(nextRecipe);
    setOutputRaw(nextRecipe.output.raw);
    setMatrix(toCellMatrix(nextRecipe));
    setSaveStatus(nextRecipe.source.kind === 'generated' ? t('values.draft') : t('values.synchronized'));
    if (nextInput !== undefined) {
      setInput(nextInput);
    }
  }

  function clearEditor() {
    applyRecipe(defaultRecipe, '');
    setStatus(t('status.cleared'));
    setSaveStatus(t('values.reset'));
    setLastApiStatus(t('values.idle'));
    setLastParseResult(t('values.reset'));
  }

  async function handleParse(value: string) {
    setInput(value);
    setStatus(t('status.parsing'));
    setLastApiStatus(t('values.pending'));
    try {
      const result = await parseText(value);
      setLastApiStatus(t('values.ok'));
      if (result.recipe) {
        applyRecipe(result.recipe, value);
        setStatus(t('status.loaded'));
        setLastParseResult(`${result.recipe.recipe_type}`);
        return;
      }
      if (result.item) {
        setStatus(`Item id: ${result.item.raw}`);
        setLastParseResult(result.item.raw);
        return;
      }
      setStatus('Backend не вернул рецепт или item id');
      setLastParseResult('empty');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Неизвестная ошибка';
      setStatus(`${t('status.parseError')}: ${message}`);
      setLastApiStatus(t('values.error'));
      setLastParseResult(message);
    }
  }

  async function handlePasteFromClipboard() {
    try {
      const pasted = await navigator.clipboard.readText();
      await handleParse(pasted);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Clipboard unavailable';
      setStatus(message);
      setLastApiStatus(t('values.error'));
    }
  }

  async function handleSave() {
    if (recipe.source.kind === 'generated' || recipe.recipe_uid === 'new-recipe') {
      setStatus('Сохранение недоступно: используйте «Сохранить как».');
      return;
    }
    setStatus('Сохраняем...');
    setSaveStatus(t('values.pending'));
    setLastApiStatus(t('values.pending'));
    try {
      const updated = await updateRecipe({ recipeUid: recipe.recipe_uid, recipeType: recipe.recipe_type, outputRaw, matrix, name: recipe.name });
      applyRecipe(updated.updatedRecipe, input);
      setStatus(t('status.saved'));
      setSaveStatus(t('values.saved'));
      setLastApiStatus(t('values.ok'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`${t('status.saveError')}: ${message}`);
      setSaveStatus(t('values.error'));
      setLastApiStatus(t('values.error'));
    }
  }

  async function handleSaveAs() {
    const targetPath = window.prompt('Куда сохранить рецепт? Укажите путь к .zs файлу.', recipe.source.path ?? 'scripts/new_recipe.zs');
    if (!targetPath) {
      setStatus(t('status.saveAsCancelled'));
      return;
    }
    setStatus('Сохраняем как...');
    setSaveStatus(t('values.pending'));
    try {
      if (recipe.recipe_uid === 'new-recipe') {
        const created = await createRecipeTemplate({ templateType: recipe.recipe_type, output: outputRaw, grid: matrix.length });
        const response = await saveRecipeAs({ recipeUid: created.recipe_uid, recipeType: created.recipe_type, outputRaw, matrix, name: created.name, targetPath });
        applyRecipe(response.recipe, input);
      } else {
        const response = await saveRecipeAs({ recipeUid: recipe.recipe_uid, recipeType: recipe.recipe_type, outputRaw, matrix, name: recipe.name, targetPath });
        applyRecipe(response.recipe, input);
      }
      setStatus(`${t('status.saved')} → ${targetPath}`);
      setSaveStatus(t('values.saved'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`${t('status.saveError')}: ${message}`);
      setSaveStatus(t('values.error'));
    }
  }

  async function handleCreateNew() {
    setStatus(t('status.creating'));
    try {
      const created = await createRecipeTemplate({ templateType: recipe.recipe_type, output: outputRaw, grid: recipe.recipe_type === 'avaritia_extreme_shaped' ? 9 : 3 });
      applyRecipe(created, '');
      setStatus(t('status.created'));
      setLastParseResult(t('status.created'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`${t('status.saveError')}: ${message}`);
    }
  }

  function handleOpenWiki() {
    const wikiUrl = new URL('/wiki.html', window.location.origin).toString();
    const openedWindow = window.open(wikiUrl, '_blank', 'noopener,noreferrer');
    if (!openedWindow) {
      window.location.assign(wikiUrl);
    }
    setStatus(t('status.docsOpened'));
  }

  function resetLayout() {
    void persistUiPreferences({ ...uiPreferences, panel_layout: normalizePanelLayout(defaultPanelLayout), active_view_tab: 'editor', reset_layout_version: 2 });
  }

  function setPanelVisible(panelId: PanelId, visible: boolean) {
    patchPanelLayout(updatePanelLayout(uiPreferences.panel_layout, panelId, (panel) => ({ ...panel, visible })));
  }

  const panelsByZone = useMemo(() => {
    const grouped = { topLeft: [] as PanelLayoutItem[], topRight: [] as PanelLayoutItem[], bottom: [] as PanelLayoutItem[], sidebar: [] as PanelLayoutItem[] };
    normalizePanelLayout(uiPreferences.panel_layout).forEach((panel) => {
      if (panel.visible) {
        grouped[panel.zone].push(panel);
      }
    });
    Object.values(grouped).forEach((panels) => panels.sort((a, b) => a.order - b.order));
    return grouped;
  }, [uiPreferences.panel_layout]);

  const statusItems = [
    { label: t('status.status'), value: status, tone: status.includes('Ошибка') || status.includes('error') ? 'warning' as const : 'success' as const },
    { label: t('status.type'), value: recipe.recipe_type },
    { label: t('status.size'), value: summary },
    { label: t('status.saveState'), value: saveStatus },
    { label: t('status.icons'), value: `${iconsResolved}/${iconTotal}` },
    { label: t('status.mode'), value: `${uiPreferences.display_mode} • ${uiPreferences.language}` }
  ];

  function buildPanelActions(panelId: PanelId) {
    return (
      <div className="panel-controls">
        <button type="button" className="ghost-button" onClick={() => patchPanelLayout(reorderWithinZone(uiPreferences.panel_layout, panelId, -1))}>{t('app.moveUp')}</button>
        <button type="button" className="ghost-button" onClick={() => patchPanelLayout(reorderWithinZone(uiPreferences.panel_layout, panelId, 1))}>{t('app.moveDown')}</button>
        <button type="button" className="ghost-button" onClick={() => patchPanelLayout(movePanelToZone(uiPreferences.panel_layout, panelId, -1))}>{t('app.movePrevZone')}</button>
        <button type="button" className="ghost-button" onClick={() => patchPanelLayout(movePanelToZone(uiPreferences.panel_layout, panelId, 1))}>{t('app.moveNextZone')}</button>
        <button type="button" className="ghost-button" onClick={() => setPanelVisible(panelId, false)}>{t('app.hidePanel')}</button>
      </div>
    );
  }

  function renderPanel(panelId: PanelId) {
    const common = { collapseLabel: '−', expandLabel: '+', actions: buildPanelActions(panelId) };
    switch (panelId) {
      case 'input':
        return (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('fields.sourceText')} {...common}>
            <div className="field-header">
              <span>{t('fields.sourceText')}</span>
              <div className="inline-actions">
                <button type="button" className="secondary-button" onClick={() => void handlePasteFromClipboard()}>{t('toolbar.paste')}</button>
                <button type="button" className="ghost-button" onClick={() => setInput('')}>{t('toolbar.clear')}</button>
              </div>
            </div>
            <textarea aria-label="paste-input" value={input} onChange={(event) => setInput(event.target.value)} onPaste={(event) => {
              const pasted = event.clipboardData.getData('text');
              void handleParse(pasted);
              event.preventDefault();
            }} />
          </Panel>
        );
      case 'output':
        return (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('panel.output')} {...common}>
            <div className="output-card">
              <div className="output-icon-slot">{uiPreferences.display_mode === 'icons' && recipe.output_resolution?.icon_url ? <img src={recipe.output_resolution.icon_url} alt={outputDisplayName ?? outputRaw} /> : <span>?</span>}</div>
              <div className="output-details">
                <div className="output-title-row"><h3>{outputDisplayName ?? t('values.unresolved')}</h3><span className={`badge ${recipe.output_resolution?.icon_url ? 'badge-success' : 'badge-warning'}`}>{recipe.output_resolution?.icon_url ? 'icon' : t('values.placeholder')}</span></div>
                <label className="field-block"><span>{t('fields.rawOutput')}</span><input aria-label="output-raw" type="text" value={outputRaw} onChange={(event) => {
                  const value = event.target.value;
                  setOutputRaw(value);
                  setRecipe((current) => ({ ...current, output: { ...current.output, raw: value } }));
                }} /></label>
                <div className="kv-grid">
                  <div><span>{t('fields.displayName')}</span><strong>{outputDisplayName ?? t('values.unresolved')}</strong></div>
                  <div><span>{t('fields.rawId')}</span><strong>{outputRaw || '—'}</strong></div>
                  <div><span>{t('fields.iconStatus')}</span><strong>{recipe.output_resolution?.icon_url ?? t('values.placeholder')}</strong></div>
                  <div><span>{t('fields.strategy')}</span><strong>{recipe.output_resolution?.strategy ?? 'n/a'}</strong></div>
                </div>
              </div>
            </div>
          </Panel>
        );
      case 'grid':
        return (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={`${t('status.size')}: ${summary}`} className="grid-panel" {...common}>
            <div className="grid-meta"><span>{t('status.size')}</span><strong>{summary}</strong><span>{t('fields.parsedCells')}</span><strong>{filledCells}</strong><span>{t('fields.nullCells')}</span><strong>{nullCells}</strong></div>
            <div className="grid-scroll-zone">
              <RecipeGrid matrix={matrix} displayMode={uiPreferences.display_mode} editorMode={uiPreferences.editor_mode} onCellChange={(row, col, value) => {
                setMatrix((current) => current.map((line, r) => line.map((cell, c) => (r === row && c === col ? (value === 'null' || value === '' ? null : value) : cell))));
                setSaveStatus(t('values.unsavedChanges'));
              }} />
            </div>
          </Panel>
        );
      case 'settings':
        return (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('fields.visiblePanels')} {...common}>
            <div className="settings-grid">
              <label className="field-block"><span>{t('fields.strictBinding')}</span><input type="checkbox" checked={strictBinding} onChange={() => setStrictBinding((value) => !value)} /></label>
              <label className="field-block"><span>{t('fields.metaMode')}</span><select aria-label="meta-mode" value={metaMode} onChange={(event) => setMetaMode(event.target.value)}><option value="strict">{t('parseModes.strict')}</option><option value="wildcard">{t('parseModes.wildcard')}</option><option value="ignore">{t('parseModes.ignore')}</option></select></label>
              <label className="field-block"><span>{t('fields.displayMode')}</span><select value={uiPreferences.display_mode} onChange={(event) => patchUiPreferences({ display_mode: event.target.value as DisplayMode })}><option value="text">text</option><option value="icons">icons</option></select></label>
              <label className="field-block"><span>{t('fields.density')}</span><select value={uiPreferences.density_mode} onChange={(event) => patchUiPreferences({ density_mode: event.target.value as DensityMode })}><option value="compact">compact</option><option value="normal">normal</option><option value="wide">wide</option></select></label>
              <label className="field-block"><span>{t('fields.editorMode')}</span><select value={uiPreferences.editor_mode} onChange={(event) => patchUiPreferences({ editor_mode: event.target.value as EditorMode })}><option value="view">view</option><option value="edit">edit</option></select></label>
            </div>
          </Panel>
        );
      case 'info':
        return (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('panel.info')} {...common}>
            <div className="kv-grid">
              <div><span>{t('status.type')}</span><strong>{recipe.recipe_type}</strong></div>
              <div><span>{t('fields.sourceFile')}</span><strong>{recipe.source.path ?? '—'}</strong></div>
              <div><span>{t('app.uid')}</span><strong>{recipe.recipe_uid}</strong></div>
              <div><span>{t('fields.parsedCells')}</span><strong>{filledCells}</strong></div>
              <div><span>{t('fields.nullCells')}</span><strong>{nullCells}</strong></div>
              <div><span>{t('fields.warnings')}</span><strong>{unresolvedCells}</strong></div>
              <div><span>{t('fields.saveStatus')}</span><strong>{saveStatus}</strong></div>
              <div><span>{t('fields.outputState')}</span><strong>{recipe.output_resolution?.display_name ? t('values.resolved') : t('values.unresolvedShort')}</strong></div>
              <div><span>{t('fields.originPath')}</span><strong>{recipe.source.path ?? settings?.project_config_path ?? '—'}</strong></div>
            </div>
          </Panel>
        );
      case 'debug':
        return (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('panel.debug')} {...common}>
            <div className="kv-grid">
              <div><span>{t('fields.lastApiStatus')}</span><strong>{lastApiStatus}</strong></div>
              <div><span>{t('fields.lastParseResult')}</span><strong>{lastParseResult}</strong></div>
              <div><span>{t('fields.outputResolved')}</span><strong>{recipe.output_resolution?.display_name ? t('values.yes') : t('values.no')}</strong></div>
              <div><span>{t('fields.iconFound')}</span><strong>{recipe.output_resolution?.icon_url ? t('values.yes') : t('values.no')}</strong></div>
              <div><span>{t('fields.displayMode')}</span><strong>{uiPreferences.display_mode}</strong></div>
              <div><span>{t('fields.configSources')}</span><strong>{(settings?.extra_icon_sources.length ?? 0) + (settings?.extra_recipe_sources.length ?? 0)}</strong></div>
            </div>
          </Panel>
        );
      case 'diagnostics':
        return (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={getTabLabel(uiPreferences.language, 'diagnostics')} {...common}>
            <ul className="diagnostics-list">
              <li>Unresolved cells: {unresolvedCells}</li>
              <li>Output icon: {recipe.output_resolution?.icon_url ?? 'not found'}</li>
              <li>Current file: {recipe.source.path ?? 'unsaved'}</li>
              <li>Current UID: {recipe.recipe_uid}</li>
            </ul>
          </Panel>
        );
      case 'preview':
        return (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={getTabLabel(uiPreferences.language, 'preview')} {...common}>
            <div className="preview-block"><strong>{outputDisplayName ?? outputRaw}</strong><span>{recipe.recipe_type}</span><span>{summary}</span></div>
          </Panel>
        );
      case 'raw':
        return (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={getTabLabel(uiPreferences.language, 'raw')} {...common}>
            <pre className="raw-block">{JSON.stringify({ recipe, matrix, ui: uiPreferences }, null, 2)}</pre>
          </Panel>
        );
      default:
        return null;
    }
  }

  const tabLabels: Record<AppTab, string> = {
    editor: getTabLabel(uiPreferences.language, 'editor'),
    preview: getTabLabel(uiPreferences.language, 'preview'),
    diagnostics: getTabLabel(uiPreferences.language, 'diagnostics'),
    raw: getTabLabel(uiPreferences.language, 'raw')
  };

  return (
    <main className={`app-shell density-${uiPreferences.density_mode} mode-${uiPreferences.editor_mode}`}>
      <header className="app-header">
        <div>
          <p className="eyebrow">{t('app.name')}</p>
          <h1>{t('app.title')}</h1>
          <p className="header-copy">{t('app.subtitle')}</p>
        </div>
        <div className="header-tools">
          <div className="header-toolbar-row">
            <label className="language-switch"><span>{t('app.language')}</span><select value={uiPreferences.language} onChange={(event) => patchUiPreferences({ language: event.target.value as UiLanguage })}><option value="ru">Русский</option><option value="en">English</option></select></label>
            <div className="view-menu-wrap">
              <button type="button" className="secondary-button" onClick={() => setIsViewMenuOpen((value) => !value)}>{t('app.view')}</button>
              {isViewMenuOpen ? (
                <div className="view-menu">
                  <strong>{t('fields.visiblePanels')}</strong>
                  {allPanelIds.map((panelId) => {
                    const panel = uiPreferences.panel_layout.find((item) => item.id === panelId);
                    return (
                      <label key={panelId} className="view-toggle">
                        <input type="checkbox" checked={panel?.visible ?? false} onChange={(event) => setPanelVisible(panelId, event.target.checked)} />
                        <span>{getPanelLabel(uiPreferences.language, panelId)}</span>
                      </label>
                    );
                  })}
                  <div className="view-menu-actions">
                    <button type="button" onClick={() => patchPanelLayout(uiPreferences.panel_layout.map((panel) => ({ ...panel, visible: true })))}>{t('app.showAllPanels')}</button>
                    <button type="button" className="ghost-button" onClick={resetLayout}>{t('app.resetLayout')}</button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="header-summary">
            <div><span>{t('app.file')}</span><strong>{recipe.source.path ?? t('app.unsaved')}</strong></div>
            <div><span>{t('app.uid')}</span><strong>{recipe.recipe_uid}</strong></div>
            <div><span>{t('app.source')}</span><strong>{recipe.source.kind}</strong></div>
          </div>
        </div>
      </header>

      <StatusBar items={statusItems} />
      <ActionToolbar
        labels={{ work: t('toolbar.work'), saveGroup: t('toolbar.saveGroup'), helpGroup: t('toolbar.helpGroup'), parse: t('toolbar.parse'), paste: t('toolbar.paste'), createNew: t('toolbar.new'), clear: t('toolbar.clear'), save: t('toolbar.save'), saveAs: t('toolbar.saveAs'), help: t('toolbar.help'), wiki: t('toolbar.wiki') }}
        onParse={() => void handleParse(input)}
        onPaste={handlePasteFromClipboard}
        onCreateNew={() => void handleCreateNew()}
        onClear={clearEditor}
        onSave={() => void handleSave()}
        onSaveAs={() => void handleSaveAs()}
        onHelp={() => setIsHelpOpen(true)}
        onWiki={handleOpenWiki}
      />
      <TabNav labels={tabLabels} value={uiPreferences.active_view_tab} onChange={(tab) => patchUiPreferences({ active_view_tab: tab })} />

      <div className="modular-workspace">
        <div className="top-zone top-zone-left">{panelsByZone.topLeft.map((panel) => renderPanel(panel.id))}</div>
        <div className="top-zone top-zone-right">{panelsByZone.topRight.map((panel) => renderPanel(panel.id))}</div>
        <div className="bottom-zone">{panelsByZone.bottom.map((panel) => renderPanel(panel.id))}</div>
        <div className="sidebar-zone">{panelsByZone.sidebar.map((panel) => renderPanel(panel.id))}</div>
      </div>

      {isHelpOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setIsHelpOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={t('help.title')} onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>{t('help.title')}</h2>
              <button type="button" onClick={() => setIsHelpOpen(false)}>{t('help.close')}</button>
            </div>
            <ul>
              {getHelpItems(uiPreferences.language).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </main>
  );
}
