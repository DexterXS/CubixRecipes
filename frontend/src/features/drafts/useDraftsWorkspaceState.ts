import { createContext, createElement, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { RecipeDraftTemplate } from '../../types';

export type DraftCloudSelectionMode = 'primary-or-single' | 'selected';

export interface DraftCloudSelection {
  itemRaws: string[];
  selectedTemplateIds: string[];
  primaryTemplateIds: Record<string, string>;
  mode: DraftCloudSelectionMode;
}

export interface DraftsWorkspaceState {
  selectedItemRaws: string[];
  previewDraftTemplateId: string | null;
  primaryTemplateIds: Record<string, string>;
  selectedTemplateIds: Record<string, boolean>;
  templatesExpanded: boolean;
  cloudSelectionMode: DraftCloudSelectionMode;
  activeDraftPreview: RecipeDraftTemplate | null;
  selectedTemplateCount: number;
  activeGridMode: '3' | '9';
  handleItemClick: (raw: string, additive: boolean) => void;
  clearItemSelection: () => void;
  setPreviewDraftTemplateId: (templateId: string | null) => void;
  setTemplateSelected: (templateId: string, selected: boolean) => void;
  setPrimaryTemplate: (template: RecipeDraftTemplate) => void;
  isPrimaryTemplate: (template: RecipeDraftTemplate) => boolean;
  toggleTemplatesExpanded: () => void;
  setCloudSelectionMode: (mode: DraftCloudSelectionMode) => void;
}

export interface DraftsWorkspaceStateOptions {
  email: string;
  selectedDraftItemRaw: string | null;
  selectedDraftTemplates: RecipeDraftTemplate[];
}

function primaryStorageKey(email: string): string {
  return `cubixrecipes:draft-primary:v1:${encodeURIComponent(email.trim().toLowerCase())}`;
}

function loadPrimaryTemplateIds(email: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(primaryStorageKey(email));
    const value = raw ? JSON.parse(raw) as unknown : null;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
    );
  } catch {
    return {};
  }
}

function persistPrimaryTemplateIds(email: string, value: Record<string, string>) {
  try {
    window.localStorage.setItem(primaryStorageKey(email), JSON.stringify(value));
  } catch {
    // Primary draft selection is a best-effort local preference.
  }
}

export function useDraftsWorkspaceState({
  email,
  selectedDraftItemRaw,
  selectedDraftTemplates
}: DraftsWorkspaceStateOptions): DraftsWorkspaceState {
  const [selectedItemRaws, setSelectedItemRaws] = useState<string[]>(() => selectedDraftItemRaw ? [selectedDraftItemRaw] : []);
  const [previewDraftTemplateId, setPreviewDraftTemplateId] = useState<string | null>(null);
  const [primaryTemplateIds, setPrimaryTemplateIds] = useState<Record<string, string>>(() => loadPrimaryTemplateIds(email));
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<Record<string, boolean>>({});
  const [templatesExpanded, setTemplatesExpanded] = useState(true);
  const [cloudSelectionMode, setCloudSelectionMode] = useState<DraftCloudSelectionMode>('primary-or-single');

  const activeDraftPreview = useMemo(() => (
    selectedDraftTemplates.find((draft) => draft.id === previewDraftTemplateId) ?? selectedDraftTemplates[0] ?? null
  ), [previewDraftTemplateId, selectedDraftTemplates]);

  const selectedTemplateCount = useMemo(
    () => selectedDraftTemplates.filter((draft) => selectedTemplateIds[draft.id]).length,
    [selectedDraftTemplates, selectedTemplateIds]
  );

  const activeGridSize = activeDraftPreview
    ? Math.max(activeDraftPreview.recipe.matrix.length, activeDraftPreview.recipe.matrix[0]?.length ?? 0)
    : 3;
  const activeGridMode = activeGridSize >= 9 ? '9' : '3';

  useEffect(() => {
    setPrimaryTemplateIds(loadPrimaryTemplateIds(email));
  }, [email]);

  useEffect(() => {
    persistPrimaryTemplateIds(email, primaryTemplateIds);
  }, [email, primaryTemplateIds]);

  useEffect(() => {
    setTemplatesExpanded(true);
    setPreviewDraftTemplateId(null);
    setSelectedTemplateIds((current) => {
      if (selectedDraftTemplates.some((draft) => current[draft.id])) return current;
      const first = selectedDraftTemplates[0];
      return first ? { ...current, [first.id]: true } : current;
    });
  }, [selectedDraftItemRaw, selectedDraftTemplates]);

  useEffect(() => {
    if (!previewDraftTemplateId || !selectedDraftTemplates.some((draft) => draft.id === previewDraftTemplateId)) {
      setPreviewDraftTemplateId(selectedDraftTemplates[0]?.id ?? null);
    }
  }, [previewDraftTemplateId, selectedDraftTemplates]);

  function handleItemClick(raw: string, additive: boolean) {
    setSelectedItemRaws((current) => {
      if (!additive) return [raw];
      return current.includes(raw) ? current.filter((item) => item !== raw) : [...current, raw];
    });
  }

  function clearItemSelection() {
    setSelectedItemRaws(selectedDraftItemRaw ? [selectedDraftItemRaw] : []);
  }

  function setTemplateSelected(templateId: string, selected: boolean) {
    setSelectedTemplateIds((current) => ({ ...current, [templateId]: selected }));
  }

  function setPrimaryTemplate(template: RecipeDraftTemplate) {
    setPrimaryTemplateIds((current) => ({ ...current, [template.outputRaw]: template.id }));
    setPreviewDraftTemplateId(template.id);
  }

  function isPrimaryTemplate(template: RecipeDraftTemplate): boolean {
    const configured = primaryTemplateIds[template.outputRaw];
    return configured ? configured === template.id : template.id === selectedDraftTemplates[0]?.id;
  }

  function toggleTemplatesExpanded() {
    setTemplatesExpanded((current) => !current);
  }

  return {
    selectedItemRaws,
    previewDraftTemplateId,
    primaryTemplateIds,
    selectedTemplateIds,
    templatesExpanded,
    cloudSelectionMode,
    activeDraftPreview,
    selectedTemplateCount,
    activeGridMode,
    handleItemClick,
    clearItemSelection,
    setPreviewDraftTemplateId,
    setTemplateSelected,
    setPrimaryTemplate,
    isPrimaryTemplate,
    toggleTemplatesExpanded,
    setCloudSelectionMode
  };
}

const DraftsWorkspaceStateContext = createContext<DraftsWorkspaceState | null>(null);

export interface DraftsWorkspaceStateProviderProps extends DraftsWorkspaceStateOptions {
  children: ReactNode;
}

export function DraftsWorkspaceStateProvider({ children, ...options }: DraftsWorkspaceStateProviderProps) {
  const state = useDraftsWorkspaceState(options);
  return createElement(DraftsWorkspaceStateContext.Provider, { value: state }, children);
}

export function useOptionalDraftsWorkspaceState(): DraftsWorkspaceState | null {
  return useContext(DraftsWorkspaceStateContext);
}

export function useDraftsWorkspaceStateContext(): DraftsWorkspaceState {
  const state = useOptionalDraftsWorkspaceState();
  if (!state) {
    throw new Error('DraftsWorkspace panels must be rendered inside DraftsWorkspaceStateProvider.');
  }
  return state;
}
