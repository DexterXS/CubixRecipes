import type { CSSProperties } from 'react';

export type IconCenterMode = 'grid' | 'absolute' | 'wrapper' | 'scale';

export type IconSurfaceId =
  | 'nei'
  | 'favorites'
  | 'draftItems'
  | 'craftGrid'
  | 'craftGrid9'
  | 'craftOutput'
  | 'draftPreview'
  | 'draftPreview9'
  | 'draftSelected'
  | 'tasks'
  | 'touchHeld'
  | 'mobileInspection';

export interface IconSurfaceSettings {
  cell: number;
  icon: number;
  gap: number;
  mode: IconCenterMode;
}

export type IconSurfaceSettingsMap = Record<IconSurfaceId, IconSurfaceSettings>;

export interface IconSurfaceDefinition {
  id: IconSurfaceId;
  label: string;
  description: string;
  defaults: IconSurfaceSettings;
  minCell: number;
  maxCell: number;
  minIcon: number;
  maxIcon: number;
}

export const iconSurfaceDefinitions: IconSurfaceDefinition[] = [
  { id: 'nei', label: 'NEI', description: 'Основная сетка предметов', defaults: { cell: 34, icon: 28, gap: 5, mode: 'scale' }, minCell: 24, maxCell: 56, minIcon: 12, maxIcon: 48 },
  { id: 'favorites', label: 'Избранное', description: 'Предметы во вкладках избранного', defaults: { cell: 34, icon: 28, gap: 5, mode: 'scale' }, minCell: 24, maxCell: 56, minIcon: 12, maxIcon: 48 },
  { id: 'draftItems', label: 'Черновики', description: 'Список предметов с черновиками', defaults: { cell: 34, icon: 28, gap: 6, mode: 'scale' }, minCell: 24, maxCell: 56, minIcon: 12, maxIcon: 48 },
  { id: 'craftGrid', label: 'Крафт 2x2/3x3', description: 'Обычная сетка крафта', defaults: { cell: 52, icon: 32, gap: 2, mode: 'scale' }, minCell: 32, maxCell: 68, minIcon: 16, maxIcon: 48 },
  { id: 'craftGrid9', label: 'Крафт 9x9', description: 'Большая сетка крафта, адаптируется к экрану', defaults: { cell: 36, icon: 20, gap: 2, mode: 'scale' }, minCell: 24, maxCell: 44, minIcon: 10, maxIcon: 32 },
  { id: 'craftOutput', label: 'Output', description: 'Слот результата крафта', defaults: { cell: 52, icon: 32, gap: 0, mode: 'scale' }, minCell: 36, maxCell: 80, minIcon: 16, maxIcon: 56 },
  { id: 'draftPreview', label: 'Превью 2x2/3x3', description: 'Предпросмотр обычных черновиков', defaults: { cell: 48, icon: 28, gap: 2, mode: 'scale' }, minCell: 28, maxCell: 64, minIcon: 12, maxIcon: 44 },
  { id: 'draftPreview9', label: 'Превью 9x9', description: 'Предпросмотр черновиков 9x9', defaults: { cell: 36, icon: 14, gap: 2, mode: 'scale' }, minCell: 20, maxCell: 44, minIcon: 8, maxIcon: 28 },
  { id: 'draftSelected', label: 'Выбранный черновик', description: 'Большая иконка выбранного предмета', defaults: { cell: 72, icon: 42, gap: 0, mode: 'scale' }, minCell: 44, maxCell: 96, minIcon: 20, maxIcon: 72 },
  { id: 'tasks', label: 'Задачи', description: 'Иконки в карточках задач', defaults: { cell: 42, icon: 32, gap: 6, mode: 'scale' }, minCell: 28, maxCell: 72, minIcon: 14, maxIcon: 56 },
  { id: 'touchHeld', label: 'Предмет под пальцем', description: 'Панель выбранного предмета на телефоне', defaults: { cell: 44, icon: 32, gap: 8, mode: 'scale' }, minCell: 32, maxCell: 72, minIcon: 16, maxIcon: 56 },
  { id: 'mobileInspection', label: 'Мобильная подсказка', description: 'Иконки внутри мобильной подсказки', defaults: { cell: 36, icon: 28, gap: 8, mode: 'scale' }, minCell: 28, maxCell: 64, minIcon: 12, maxIcon: 48 }
];

export const defaultIconSurfaceSettings = iconSurfaceDefinitions.reduce((acc, surface) => {
  acc[surface.id] = { ...surface.defaults };
  return acc;
}, {} as IconSurfaceSettingsMap);

const modeSet = new Set<IconCenterMode>(['grid', 'absolute', 'wrapper', 'scale']);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function normalizeIconSurfaceSettings(raw?: Partial<Record<string, Partial<IconSurfaceSettings>>> | null): IconSurfaceSettingsMap {
  const source = raw && typeof raw === 'object' ? raw : {};
  return iconSurfaceDefinitions.reduce((acc, surface) => {
    const incoming = source[surface.id] ?? {};
    const cell = clamp(Math.round(Number(incoming.cell ?? surface.defaults.cell) || surface.defaults.cell), surface.minCell, surface.maxCell);
    const icon = clamp(Math.round(Number(incoming.icon ?? surface.defaults.icon) || surface.defaults.icon), surface.minIcon, surface.maxIcon);
    const gap = clamp(Math.round(Number(incoming.gap ?? surface.defaults.gap) || surface.defaults.gap), 0, 24);
    const mode = modeSet.has(incoming.mode as IconCenterMode) ? incoming.mode as IconCenterMode : surface.defaults.mode;
    acc[surface.id] = { cell, icon, gap, mode };
    return acc;
  }, {} as IconSurfaceSettingsMap);
}

export function patchIconSurfaceSettings(
  current: Partial<Record<string, Partial<IconSurfaceSettings>>> | null | undefined,
  surfaceId: IconSurfaceId,
  next: IconSurfaceSettings
): IconSurfaceSettingsMap {
  return normalizeIconSurfaceSettings({
    ...(current ?? {}),
    [surfaceId]: next
  });
}

export type IconViewport = {
  width: number;
  height: number;
};

function dynamicCraftCell(surface: IconSurfaceSettings, viewport: IconViewport | null, gridSize: 3 | 9): number {
  if (!viewport) return surface.cell;
  const horizontalReserve = gridSize === 9 ? 132 : 220;
  const verticalReserve = gridSize === 9 ? 392 : 460;
  const widthCell = (viewport.width - horizontalReserve) / gridSize;
  const heightCell = (viewport.height - verticalReserve) / gridSize;
  const fitted = Math.floor(Math.min(widthCell, heightCell));
  const min = gridSize === 9 ? 24 : 32;
  return clamp(Number.isFinite(fitted) ? fitted : surface.cell, min, surface.cell);
}

function scaledIcon(base: IconSurfaceSettings, nextCell: number, minIcon: number): number {
  const next = Math.round(nextCell * (base.icon / Math.max(base.cell, 1)));
  return clamp(next, minIcon, base.icon);
}

export function buildIconSurfaceCssVars(
  settings: Partial<Record<string, Partial<IconSurfaceSettings>>> | null | undefined,
  viewport: IconViewport | null
): CSSProperties {
  const normalized = normalizeIconSurfaceSettings(settings);
  const craftCell = dynamicCraftCell(normalized.craftGrid, viewport, 3);
  const craftIcon = scaledIcon(normalized.craftGrid, craftCell, 16);
  const craft9Cell = dynamicCraftCell(normalized.craftGrid9, viewport, 9);
  const craft9Icon = scaledIcon(normalized.craftGrid9, craft9Cell, 10);
  const resolved: IconSurfaceSettingsMap = {
    ...normalized,
    craftGrid: { ...normalized.craftGrid, cell: craftCell, icon: craftIcon },
    craftGrid9: { ...normalized.craftGrid9, cell: craft9Cell, icon: craft9Icon }
  };
  const vars: Record<string, string> = {};
  iconSurfaceDefinitions.forEach((surface) => {
    const value = resolved[surface.id];
    const prefix = `--icon-${surface.id.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
    vars[`${prefix}-cell`] = `${value.cell}px`;
    vars[`${prefix}-icon`] = `${value.icon}px`;
    vars[`${prefix}-gap`] = `${value.gap}px`;
    vars[`${prefix}-scale`] = String(value.icon / 32);
  });
  return vars as CSSProperties;
}
