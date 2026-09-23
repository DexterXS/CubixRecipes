import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  defaultIconSurfaceSettings,
  defaultMobileIconSurfaceSettings,
  iconSurfaceDefinitions,
  isMobileIconViewport,
  type IconSurfaceId,
  type IconSurfaceSettings,
  type IconSurfaceSettingsMap,
  normalizeIconSurfaceSettings
} from './iconSurfaces';
import { useIconViewport } from './useIconViewport';
import { IconSurfaceSettingsPopover } from './IconSurfaceSettingsPopover';
import './IconSurfaceSettings.css';

export type IconSettingsProfile = 'desktop' | 'mobile';
export type IconSurfaceSettingsSource = Partial<Record<string, Partial<IconSurfaceSettings>>> | null | undefined;

export type IconSurfaceSettingsContextValue = {
  profile: IconSettingsProfile;
  activeSurfaceId: IconSurfaceId | null;
  draft: IconSurfaceSettings | null;
  saved: IconSurfaceSettings | null;
  isDirty: boolean;
  isSaving: boolean;
  error: string | null;
  openSurface: (surfaceId: IconSurfaceId, trigger?: HTMLElement | null) => void;
  patchDraft: (patch: Partial<IconSurfaceSettings>) => void;
  save: () => Promise<void>;
  cancel: () => void;
  resetSurface: () => void;
  resetProfile: () => void;
  close: () => void;
  canEdit: boolean;
};

type ProviderProps = {
  desktopSettings: IconSurfaceSettingsSource;
  mobileSettings: IconSurfaceSettingsSource;
  onLiveChange: (profile: IconSettingsProfile, settings: IconSurfaceSettingsMap) => void;
  onSave: (profile: IconSettingsProfile, settings: IconSurfaceSettingsMap) => Promise<void>;
  renderSampleIcon?: (surfaceId: IconSurfaceId, settings: IconSurfaceSettings) => ReactNode;
  canEdit?: boolean;
  children: ReactNode;
};

const Context = createContext<IconSurfaceSettingsContextValue | null>(null);

function defaultsFor(profile: IconSettingsProfile): IconSurfaceSettingsMap {
  return profile === 'mobile' ? defaultMobileIconSurfaceSettings : defaultIconSurfaceSettings;
}

function normalizedMap(profile: IconSettingsProfile, settings: IconSurfaceSettingsSource): IconSurfaceSettingsMap {
  return normalizeIconSurfaceSettings(settings, defaultsFor(profile));
}

function sameSettings(left: IconSurfaceSettings | null, right: IconSurfaceSettings | null): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function IconSurfaceSettingsProvider({
  desktopSettings,
  mobileSettings,
  onLiveChange,
  onSave,
  renderSampleIcon,
  canEdit = true,
  children
}: ProviderProps) {
  const viewport = useIconViewport();
  const profile: IconSettingsProfile = isMobileIconViewport(viewport) ? 'mobile' : 'desktop';
  const [activeSurfaceId, setActiveSurfaceId] = useState<IconSurfaceId | null>(null);
  const [draft, setDraft] = useState<IconSurfaceSettings | null>(null);
  const [saved, setSaved] = useState<IconSurfaceSettings | null>(null);
  const [savedMap, setSavedMap] = useState<IconSurfaceSettingsMap | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);

  const currentMap = useMemo(
    () => normalizedMap(profile, profile === 'mobile' ? mobileSettings : desktopSettings),
    [desktopSettings, mobileSettings, profile]
  );

  const openSurface = useCallback((surfaceId: IconSurfaceId, trigger?: HTMLElement | null) => {
    const restoredMap = activeSurfaceId && savedMap ? savedMap : null;
    if (activeSurfaceId && savedMap) {
      onLiveChange(profile, savedMap);
    }
    const nextMap = restoredMap ?? normalizedMap(profile, profile === 'mobile' ? mobileSettings : desktopSettings);
    const nextValue = nextMap[surfaceId];
    if (!nextValue) return;
    triggerRef.current = trigger ?? null;
    setActiveSurfaceId(surfaceId);
    setDraft(nextValue);
    setSaved(nextValue);
    setSavedMap(nextMap);
    setError(null);
    setIsSaving(false);
  }, [activeSurfaceId, desktopSettings, mobileSettings, onLiveChange, profile, savedMap]);

  const applyLive = useCallback((nextMap: IconSurfaceSettingsMap) => {
    onLiveChange(profile, nextMap);
  }, [onLiveChange, profile]);

  const patchDraft = useCallback((patch: Partial<IconSurfaceSettings>) => {
    if (!activeSurfaceId || !draft) return;
    const next = normalizeIconSurfaceSettings({ [activeSurfaceId]: { ...draft, ...patch } }, defaultsFor(profile))[activeSurfaceId];
    const nextMap = { ...currentMap, [activeSurfaceId]: next };
    setDraft(next);
    applyLive(nextMap);
  }, [activeSurfaceId, applyLive, currentMap, draft, profile]);

  const restoreSaved = useCallback(() => {
    if (savedMap) applyLive(savedMap);
  }, [applyLive, savedMap]);

  const finishClose = useCallback(() => {
    setActiveSurfaceId(null);
    setDraft(null);
    setSaved(null);
    setSavedMap(null);
    setError(null);
    setIsSaving(false);
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  const cancel = useCallback(() => {
    restoreSaved();
    finishClose();
  }, [finishClose, restoreSaved]);

  const save = useCallback(async () => {
    if (!activeSurfaceId || !draft || isSaving) return;
    const nextMap = { ...currentMap, [activeSurfaceId]: draft };
    setIsSaving(true);
    setError(null);
    try {
      await onSave(profile, nextMap);
      setSaved(draft);
      setSavedMap(nextMap);
      finishClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
      setIsSaving(false);
    }
  }, [activeSurfaceId, currentMap, draft, finishClose, isSaving, onSave, profile]);

  const resetSurface = useCallback(() => {
    if (!activeSurfaceId) return;
    const next = defaultsFor(profile)[activeSurfaceId];
    setDraft(next);
    applyLive({ ...currentMap, [activeSurfaceId]: next });
  }, [activeSurfaceId, applyLive, currentMap, profile]);

  const resetProfile = useCallback(() => {
    const nextMap = defaultsFor(profile);
    setDraft(activeSurfaceId ? nextMap[activeSurfaceId] : null);
    applyLive(nextMap);
  }, [activeSurfaceId, applyLive, profile]);

  const close = useCallback(() => {
    cancel();
  }, [cancel]);

  const value = useMemo<IconSurfaceSettingsContextValue>(() => ({
    profile,
    activeSurfaceId,
    draft,
    saved,
    isDirty: !sameSettings(draft, saved),
    isSaving,
    error,
    openSurface,
    patchDraft,
    save,
    cancel,
    resetSurface,
    resetProfile,
    close,
    canEdit
  }), [activeSurfaceId, canEdit, cancel, close, draft, error, isSaving, openSurface, patchDraft, profile, resetProfile, resetSurface, save, saved]);

  const surface = activeSurfaceId ? iconSurfaceDefinitions.find((item) => item.id === activeSurfaceId) : null;

  useEffect(() => {
    if (!activeSurfaceId || !surface) return;
    const next = currentMap[activeSurfaceId];
    if (!draft) return;
    // External profile reloads are allowed to update the saved baseline only when the menu is clean.
    if (!value.isDirty && !sameSettings(next, draft)) {
      setDraft(next);
      setSaved(next);
      setSavedMap(currentMap);
    }
  }, [activeSurfaceId, currentMap, draft, profile, surface, value.isDirty]);

  return (
    <Context.Provider value={value}>
      {children}
      {canEdit && activeSurfaceId && draft && surface ? (
        <IconSurfaceSettingsPopover
          surface={surface}
          profile={profile}
          value={draft}
          savedValue={saved ?? draft}
          isDirty={value.isDirty}
          isSaving={isSaving}
          error={error}
          renderSampleIcon={renderSampleIcon}
          onChange={patchDraft}
          onSave={() => void save()}
          onCancel={cancel}
          onResetSurface={resetSurface}
          onResetProfile={resetProfile}
          onClose={close}
        />
      ) : null}
    </Context.Provider>
  );
}

export function useIconSurfaceSettings(): IconSurfaceSettingsContextValue {
  const context = useContext(Context);
  if (!context) throw new Error('useIconSurfaceSettings must be used inside IconSurfaceSettingsProvider');
  return context;
}
