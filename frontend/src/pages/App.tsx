import { Fragment, type DragEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ActionToolbar } from '../components/ActionToolbar';
import { Panel } from '../components/Panel';
import { RecipeGrid } from '../components/RecipeGrid';
import { StatusBar } from '../components/StatusBar';
import { TabNav } from '../components/TabNav';
import { createTranslator, getHelpItems, getPanelLabel, getTabLabel } from '../i18n';
import { createRecipeTemplate, getProjectSettings, parseText, saveRecipeAs, updateProjectUiPreferences, updateRecipe } from '../services/api';
import { logFrontendEvent } from '../services/debugLog';
import { AppTab, CellValue, DensityMode, DisplayMode, EditorMode, PanelId, PanelLayoutItem, PanelZone, ProjectSettings, RecipeView, UiLanguage, UiPreferences, WorkspaceLayout } from '../types';

const defaultMatrix: CellValue[][] = [
  [null, null, null],
  [null, null, null],
  [null, null, null]
];

const defaultWorkspaceLayout: WorkspaceLayout = {
  top_ratio: 55,
  main_ratio: 68
};

const defaultPanelLayout: PanelLayoutItem[] = [
  { id: 'input', zone: 'topLeft', order: 0, visible: true, height: 420 },
  { id: 'output', zone: 'topRight', order: 0, visible: true, height: 420 },
  { id: 'grid', zone: 'bottom', order: 0, visible: true, height: 420 },
  { id: 'settings', zone: 'bottom', order: 1, visible: true, height: 320 },
  { id: 'info', zone: 'sidebar', order: 0, visible: true, height: 280 },
  { id: 'debug', zone: 'sidebar', order: 1, visible: true, height: 280 },
  { id: 'diagnostics', zone: 'sidebar', order: 2, visible: true, height: 260 },
  { id: 'preview', zone: 'sidebar', order: 3, visible: false, height: 220 },
  { id: 'raw', zone: 'sidebar', order: 4, visible: false, height: 260 }
];

const allPanelIds: PanelId[] = defaultPanelLayout.map((panel) => panel.id);
const orderedZones: PanelZone[] = ['topLeft', 'topRight', 'bottom', 'sidebar'];
const PANEL_MIN_HEIGHT = 220;
const PANEL_MAX_HEIGHT = 960;

const defaultUiPreferences: UiPreferences = {
  display_mode: 'text',
  density_mode: 'normal',
  editor_mode: 'edit',
  language: 'ru',
  active_view_tab: 'editor',
  reset_layout_version: 3,
  panel_layout: defaultPanelLayout,
  workspace_layout: defaultWorkspaceLayout
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

interface DropTarget {
  zone: PanelZone;
  index: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

function cloneMatrix(matrix: CellValue[][]): CellValue[][] {
  return matrix.map((row) => [...row]);
}

function toCellMatrix(recipe: RecipeView): CellValue[][] {
  return recipe.matrix.map((row) => row.map((cell) => cell.raw));
}

function normalizeOrders(layout: PanelLayoutItem[]): PanelLayoutItem[] {
  const normalized = layout.map((item) => ({ ...item }));
  orderedZones.forEach((zone) => {
    normalized
      .filter((item) => item.zone === zone)
      .sort((left, right) => left.order - right.order)
      .forEach((item, index) => {
        item.order = index;
      });
  });
  return normalized;
}

function normalizePanelLayout(rawLayout?: PanelLayoutItem[] | null): PanelLayoutItem[] {
  const result = rawLayout && rawLayout.length ? rawLayout.map((item) => ({ ...item })) : [];
  const seen = new Set(result.map((item) => item.id));
  defaultPanelLayout.forEach((item) => {
    if (!seen.has(item.id)) {
      result.push({ ...item });
    }
  });
  return normalizeOrders(
    result.map((item, index) => ({
      id: item.id,
      zone: orderedZones.includes(item.zone) ? item.zone : 'bottom',
      order: Number.isFinite(item.order) ? item.order : index,
      visible: item.visible !== false,
      height: typeof item.height === 'number' ? clamp(item.height, PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT) : defaultPanelLayout.find((panel) => panel.id === item.id)?.height
    }))
  );
}

function normalizeWorkspaceLayout(layout?: WorkspaceLayout | null): WorkspaceLayout {
  return {
    top_ratio: clamp(Math.round(layout?.top_ratio ?? defaultWorkspaceLayout.top_ratio), 30, 70),
    main_ratio: clamp(Math.round(layout?.main_ratio ?? defaultWorkspaceLayout.main_ratio), 30, 75)
  };
}

function normalizeUiPreferences(settings?: ProjectSettings | null): UiPreferences {
  const source = settings?.ui_preferences;
  return {
    display_mode: (source?.display_mode ?? 'text') as DisplayMode,
    density_mode: (source?.density_mode ?? 'normal') as DensityMode,
    editor_mode: (source?.editor_mode ?? 'edit') as EditorMode,
    language: (source?.language ?? 'ru') as UiLanguage,
    active_view_tab: (source?.active_view_tab ?? 'editor') as AppTab,
    reset_layout_version: source?.reset_layout_version ?? 3,
    panel_layout: normalizePanelLayout(source?.panel_layout),
    workspace_layout: normalizeWorkspaceLayout(source?.workspace_layout)
  };
}

function updatePanelLayout(layout: PanelLayoutItem[], panelId: PanelId, updater: (panel: PanelLayoutItem) => PanelLayoutItem): PanelLayoutItem[] {
  return normalizeOrders(layout.map((panel) => (panel.id === panelId ? updater(panel) : panel)));
}

function movePanel(layout: PanelLayoutItem[], panelId: PanelId, target: DropTarget): PanelLayoutItem[] {
  const source = layout.find((item) => item.id === panelId);
  if (!source) {
    return layout;
  }
  const without = layout.filter((item) => item.id !== panelId);
  const zoneItems = without.filter((item) => item.zone === target.zone).sort((left, right) => left.order - right.order);
  const insertAt = clamp(target.index, 0, zoneItems.length);
  const movedPanel = { ...source, zone: target.zone, visible: true };
  const rebuilt: PanelLayoutItem[] = [];
  orderedZones.forEach((zone) => {
    const items = zone === target.zone
      ? [...without.filter((item) => item.zone === zone).sort((left, right) => left.order - right.order)]
      : without.filter((item) => item.zone === zone).sort((left, right) => left.order - right.order);
    if (zone === target.zone) {
      items.splice(insertAt, 0, movedPanel);
    }
    items.forEach((item, order) => {
      rebuilt.push({ ...item, zone, order });
    });
  });
  return normalizeOrders(rebuilt);
}

function setPanelHeight(layout: PanelLayoutItem[], panelId: PanelId, nextHeight: number): PanelLayoutItem[] {
  return updatePanelLayout(layout, panelId, (panel) => ({ ...panel, height: clamp(Math.round(nextHeight), PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT) }));
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
  const [draggedPanelId, setDraggedPanelId] = useState<PanelId | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const persistTimerRef = useRef<number | null>(null);
  const latestUiPreferencesRef = useRef<UiPreferences>(defaultUiPreferences);

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
        const normalized = normalizeUiPreferences(nextSettings);
        latestUiPreferencesRef.current = normalized;
        setUiPreferences(normalized);
      } catch {
        setStatus('Не удалось загрузить UI-настройки, используются значения по умолчанию.');
      }
    })();
  }, []);

  useEffect(() => () => {
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
  }, []);

  function persistUiPreferences(next: UiPreferences) {
    latestUiPreferencesRef.current = next;
    setUiPreferences(next);
    if (persistTimerRef.current !== null) {
      window.clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await updateProjectUiPreferences(latestUiPreferencesRef.current);
          setSettings(response);
          setSaveStatus(createTranslator(latestUiPreferencesRef.current.language)('fields.layoutSaved'));
          logFrontendEvent({ level: 'INFO', category: 'LAYOUT', message: 'Workspace layout persisted', details: { panel_count: latestUiPreferencesRef.current.panel_layout.length, workspace: latestUiPreferencesRef.current.workspace_layout } });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          setStatus(`${createTranslator(latestUiPreferencesRef.current.language)('status.saveError')}: ${message}`);
        }
      })();
    }, 220);
  }

  function patchUiPreferences(patch: Partial<UiPreferences>) {
    persistUiPreferences({ ...uiPreferences, ...patch });
  }

  function patchPanelLayout(nextLayout: PanelLayoutItem[]) {
    persistUiPreferences({ ...uiPreferences, panel_layout: normalizePanelLayout(nextLayout) });
  }

  function patchWorkspaceLayout(nextLayout: WorkspaceLayout) {
    persistUiPreferences({ ...uiPreferences, workspace_layout: normalizeWorkspaceLayout(nextLayout) });
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
    persistUiPreferences({ ...uiPreferences, panel_layout: normalizePanelLayout(defaultPanelLayout), workspace_layout: defaultWorkspaceLayout, active_view_tab: 'editor', reset_layout_version: 3 });
  }

  function setPanelVisible(panelId: PanelId, visible: boolean) {
    patchPanelLayout(updatePanelLayout(uiPreferences.panel_layout, panelId, (panel) => ({ ...panel, visible })));
  }

  function handleDragStart(panelId: PanelId) {
    setDraggedPanelId(panelId);
    setDropTarget(null);
  }

  function handleDrop(zone: PanelZone, index: number) {
    if (!draggedPanelId) {
      return;
    }
    patchPanelLayout(movePanel(uiPreferences.panel_layout, draggedPanelId, { zone, index }));
    setDropTarget(null);
    setDraggedPanelId(null);
  }

  function startPanelResize(panelId: PanelId, clientY: number) {
    const startHeight = uiPreferences.panel_layout.find((panel) => panel.id === panelId)?.height ?? 320;
    const onMove = (event: globalThis.PointerEvent | MouseEvent) => {
      const nextClientY = typeof event.clientY === 'number' ? event.clientY : clientY;
      patchPanelLayout(setPanelHeight(latestUiPreferencesRef.current.panel_layout, panelId, startHeight + (nextClientY - clientY)));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('mouseup', onUp);
  }

  function startWorkspaceResize(kind: 'top_ratio' | 'main_ratio', clientX: number) {
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const startRatio = uiPreferences.workspace_layout[kind];
    const onMove = (event: globalThis.PointerEvent | MouseEvent) => {
      const nextClientX = typeof event.clientX === 'number' ? event.clientX : clientX;
      const deltaRatio = ((nextClientX - clientX) / rect.width) * 100;
      patchWorkspaceLayout({
        ...latestUiPreferencesRef.current.workspace_layout,
        [kind]: clamp(Math.round(startRatio + deltaRatio), kind === 'top_ratio' ? 30 : 35, kind === 'top_ratio' ? 70 : 75)
      });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('mouseup', onUp);
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

  function renderDropSlot(zone: PanelZone, index: number) {
    const active = dropTarget?.zone === zone && dropTarget.index === index;
    return (
      <div
        key={`${zone}-${index}`}
        className={`drop-slot ${draggedPanelId ? 'is-visible' : ''} ${active ? 'is-active' : ''}`.trim()}
        onDragOver={(event) => {
          event.preventDefault();
          if (draggedPanelId) {
            setDropTarget({ zone, index });
          }
        }}
        onDrop={(event) => {
          event.preventDefault();
          handleDrop(zone, index);
        }}
      >
        <span>{active ? `${t('app.dragPanel')} → ${getPanelLabel(uiPreferences.language, draggedPanelId ?? allPanelIds[0])}` : t('app.resizeWorkspace')}</span>
      </div>
    );
  }

  function renderPanel(panel: PanelLayoutItem) {
    const panelId = panel.id;
    const common = {
      collapseLabel: '−',
      expandLabel: '+',
      actions: (
        <div className="panel-controls">
          <button type="button" className="ghost-button" onClick={() => setPanelVisible(panelId, false)}>{t('app.hidePanel')}</button>
        </div>
      ),
      dragHandle: (
        <button
          type="button"
          className="panel-drag-handle"
          draggable
          aria-label={`${t('app.dragPanel')}: ${getPanelLabel(uiPreferences.language, panelId)}`}
          title={t('app.dragPanel')}
          onDragStart={(event: DragEvent<HTMLButtonElement>) => {
            if (event.dataTransfer) {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', panelId);
            }
            handleDragStart(panelId);
          }}
          onDragEnd={() => {
            setDraggedPanelId(null);
            setDropTarget(null);
          }}
        >
          ⋮⋮
        </button>
      ),
      footer: (
        <button
          type="button"
          className="panel-resize-handle"
          aria-label={`${t('app.resizePanel')}: ${getPanelLabel(uiPreferences.language, panelId)}`}
          title={t('app.resizePanel')}
          onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
            event.preventDefault();
            startPanelResize(panelId, event.clientY);
          }}
        >
          <span />
        </button>
      )
    };

    let content = null;
    switch (panelId) {
      case 'input':
        content = (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('fields.sourceText')} {...common} className="panel-kind-input">
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
        break;
      case 'output':
        content = (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('panel.output')} {...common} className="panel-kind-output">
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
        break;
      case 'grid':
        content = (
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
        break;
      case 'settings':
        content = (
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
        break;
      case 'info':
        content = (
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
        break;
      case 'debug':
        content = (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={t('panel.debug')} {...common}>
            <div className="kv-grid">
              <div><span>{t('fields.lastApiStatus')}</span><strong>{lastApiStatus}</strong></div>
              <div><span>{t('fields.lastParseResult')}</span><strong>{lastParseResult}</strong></div>
              <div><span>{t('fields.outputResolved')}</span><strong>{recipe.output_resolution?.display_name ? t('values.yes') : t('values.no')}</strong></div>
              <div><span>{t('fields.iconFound')}</span><strong>{recipe.output_resolution?.icon_url ? t('values.yes') : t('values.no')}</strong></div>
              <div><span>{t('fields.displayMode')}</span><strong>{uiPreferences.display_mode}</strong></div>
              <div><span>{t('fields.configSources')}</span><strong>{(settings?.extra_icon_sources?.length ?? 0) + (settings?.extra_recipe_sources?.length ?? 0)}</strong></div>
            </div>
          </Panel>
        );
        break;
      case 'diagnostics':
        content = (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={getTabLabel(uiPreferences.language, 'diagnostics')} {...common}>
            <ul className="diagnostics-list">
              <li>Unresolved cells: {unresolvedCells}</li>
              <li>Output icon: {recipe.output_resolution?.icon_url ?? 'not found'}</li>
              <li>Current file: {recipe.source.path ?? 'unsaved'}</li>
              <li>Current UID: {recipe.recipe_uid}</li>
            </ul>
          </Panel>
        );
        break;
      case 'preview':
        content = (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={getTabLabel(uiPreferences.language, 'preview')} {...common}>
            <div className="preview-block"><strong>{outputDisplayName ?? outputRaw}</strong><span>{recipe.recipe_type}</span><span>{summary}</span></div>
          </Panel>
        );
        break;
      case 'raw':
        content = (
          <Panel key={panelId} title={getPanelLabel(uiPreferences.language, panelId)} subtitle={getTabLabel(uiPreferences.language, 'raw')} {...common}>
            <pre className="raw-block">{JSON.stringify({ recipe, matrix, ui: uiPreferences }, null, 2)}</pre>
          </Panel>
        );
        break;
      default:
        content = null;
    }

    return (
      <div key={panelId} className={`workspace-panel-shell ${draggedPanelId === panelId ? 'is-dragging' : ''}`.trim()} style={{ height: panel.height ? `${panel.height}px` : undefined }}>
        {content}
      </div>
    );
  }

  function renderZone(zone: PanelZone, className: string) {
    const panels = panelsByZone[zone];
    return (
      <div className={className} onDragOver={(event) => panels.length === 0 && event.preventDefault()} onDrop={(event) => {
        event.preventDefault();
        if (panels.length === 0) {
          handleDrop(zone, 0);
        }
      }}>
        {renderDropSlot(zone, 0)}
        {panels.map((panel, index) => (
          <Fragment key={panel.id}>
            {renderPanel(panel)}
            {renderDropSlot(zone, index + 1)}
          </Fragment>
        ))}
      </div>
    );
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
            <label className="language-switch"><span>{t('app.language')}</span><select aria-label={t('app.language')} value={uiPreferences.language} onChange={(event) => patchUiPreferences({ language: event.target.value as UiLanguage })}><option value="ru">Русский</option><option value="en">English</option></select></label>
            <div className="view-menu-wrap">
              <button type="button" className="secondary-button" onClick={() => setIsViewMenuOpen((value) => !value)}>{t('app.view')}</button>
              {isViewMenuOpen ? (
                <div className="view-menu">
                  <strong>{t('fields.visiblePanels')}</strong>
                  {allPanelIds.map((panelId) => {
                    const panel = uiPreferences.panel_layout.find((item) => item.id === panelId);
                    return (
                      <label key={panelId} className="view-toggle" aria-label={getPanelLabel(uiPreferences.language, panelId)}>
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

      <div className="workspace-intro-card">
        <strong>{t('fields.workspace')}</strong>
        <span>{t('app.dragPanel')} • {t('app.resizePanel')} • {t('app.resizeWorkspace')}</span>
      </div>

      <div className="modular-workspace" ref={workspaceRef}>
        <div className="workspace-top" style={{ gridTemplateColumns: `${uiPreferences.workspace_layout.top_ratio}fr 12px ${100 - uiPreferences.workspace_layout.top_ratio}fr` }}>
          {renderZone('topLeft', 'zone-stack top-zone-left')}
          <button type="button" className="workspace-splitter" aria-label={t('app.resizeWorkspace')} title={t('app.resizeWorkspace')} onPointerDown={(event) => {
            event.preventDefault();
            startWorkspaceResize('top_ratio', event.clientX);
          }} />
          {renderZone('topRight', 'zone-stack top-zone-right')}
        </div>
        <div className="workspace-bottom" style={{ gridTemplateColumns: `${uiPreferences.workspace_layout.main_ratio}fr 12px ${100 - uiPreferences.workspace_layout.main_ratio}fr` }}>
          {renderZone('bottom', 'zone-stack bottom-zone')}
          <button type="button" className="workspace-splitter" aria-label={t('app.resizeWorkspace')} title={t('app.resizeWorkspace')} onPointerDown={(event) => {
            event.preventDefault();
            startWorkspaceResize('main_ratio', event.clientX);
          }} />
          {renderZone('sidebar', 'zone-stack sidebar-zone')}
        </div>
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
