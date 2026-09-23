import type { CSSProperties } from 'react';

export type IconCenterMode = 'grid' | 'absolute' | 'wrapper' | 'scale';
export type IconOverflowMode = 'clip' | 'visible' | 'scroll';
export type IconSmoothingMode = 'pixelated' | 'smooth';

export type IconSurfaceId =
  | 'nei'
  | 'favorites'
  | 'draftItems'
  | 'craftGrid'
  | 'craftGrid9'
  | 'cubixCraftGrid'
  | 'craftOutput'
  | 'draftPreview'
  | 'draftPreview9'
  | 'draftSelected'
  | 'draftTemplateIcon'
  | 'tasks'
  | 'auctionPreview'
  | 'auctionLotItems'
  | 'auctionNei'
  | 'touchHeld'
  | 'mobileInspection';

export interface IconSurfaceSettings {
  cell: number;
  icon: number;
  gap: number;
  gapX: number;
  gapY: number;
  padding: number;
  borderWidth: number;
  spriteScale: number;
  offsetX: number;
  offsetY: number;
  overflow: IconOverflowMode;
  smoothing: IconSmoothingMode;
  groupRows: boolean;
  groupColumns: boolean;
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

type IconSurfaceDefaultsInput = Pick<IconSurfaceSettings, 'cell' | 'icon' | 'gap' | 'mode'> & Partial<IconSurfaceSettings>;

function surfaceDefaults(input: IconSurfaceDefaultsInput): IconSurfaceSettings {
  return {
    cell: input.cell,
    icon: input.icon,
    gap: input.gap,
    gapX: input.gapX ?? input.gap,
    gapY: input.gapY ?? input.gap,
    padding: input.padding ?? 0,
    borderWidth: input.borderWidth ?? 0,
    spriteScale: input.spriteScale ?? 1,
    offsetX: input.offsetX ?? 0,
    offsetY: input.offsetY ?? 0,
    overflow: input.overflow ?? 'visible',
    smoothing: input.smoothing ?? 'pixelated',
    groupRows: input.groupRows ?? false,
    groupColumns: input.groupColumns ?? false,
    mode: input.mode
  };
}

export const iconSurfaceDefinitions: IconSurfaceDefinition[] = [
  { id: 'nei', label: 'NEI', description: 'Основная сетка предметов', defaults: surfaceDefaults({ cell: 34, icon: 28, gap: 5, mode: 'scale' }), minCell: 24, maxCell: 56, minIcon: 12, maxIcon: 48 },
  { id: 'favorites', label: 'Избранное', description: 'Предметы во вкладках избранного', defaults: surfaceDefaults({ cell: 34, icon: 28, gap: 5, mode: 'scale' }), minCell: 24, maxCell: 56, minIcon: 12, maxIcon: 48 },
  { id: 'draftItems', label: 'Черновики', description: 'Список предметов с черновиками', defaults: surfaceDefaults({ cell: 34, icon: 28, gap: 6, mode: 'scale' }), minCell: 24, maxCell: 56, minIcon: 12, maxIcon: 48 },
  { id: 'craftGrid', label: 'Крафт 2x2/3x3', description: 'Обычная сетка крафта', defaults: surfaceDefaults({ cell: 52, icon: 32, gap: 2, mode: 'scale' }), minCell: 32, maxCell: 68, minIcon: 16, maxIcon: 48 },
  { id: 'craftGrid9', label: 'Крафт 9x9', description: 'Большая сетка крафта, адаптируется к экрану', defaults: surfaceDefaults({ cell: 36, icon: 20, gap: 2, mode: 'scale' }), minCell: 24, maxCell: 44, minIcon: 10, maxIcon: 32 },
  { id: 'cubixCraftGrid', label: 'CubixCraft 9x9', description: 'Ячейки и иконки отдельной сетки CubixCraft', defaults: surfaceDefaults({ cell: 36, icon: 20, gap: 2, mode: 'absolute' }), minCell: 24, maxCell: 52, minIcon: 8, maxIcon: 40 },
  { id: 'craftOutput', label: 'Output', description: 'Слот результата крафта', defaults: surfaceDefaults({ cell: 52, icon: 32, gap: 0, mode: 'scale' }), minCell: 36, maxCell: 80, minIcon: 16, maxIcon: 56 },
  { id: 'draftPreview', label: 'Превью 2x2/3x3', description: 'Предпросмотр обычных черновиков', defaults: surfaceDefaults({ cell: 48, icon: 28, gap: 2, mode: 'scale' }), minCell: 28, maxCell: 64, minIcon: 12, maxIcon: 44 },
  { id: 'draftPreview9', label: 'Превью 9x9', description: 'Предпросмотр черновиков 9x9', defaults: surfaceDefaults({ cell: 36, icon: 14, gap: 2, mode: 'scale' }), minCell: 20, maxCell: 44, minIcon: 8, maxIcon: 28 },
  { id: 'draftSelected', label: 'Выбранный черновик', description: 'Большая иконка выбранного предмета', defaults: surfaceDefaults({ cell: 72, icon: 42, gap: 0, mode: 'scale' }), minCell: 44, maxCell: 96, minIcon: 20, maxIcon: 72 },
  { id: 'draftTemplateIcon', label: 'Иконка рецепта', description: 'Иконка конкретного рецепта в списке черновиков', defaults: surfaceDefaults({ cell: 38, icon: 30, gap: 0, mode: 'scale' }), minCell: 28, maxCell: 56, minIcon: 12, maxIcon: 48 },
  { id: 'tasks', label: 'Задачи', description: 'Иконки в карточках задач', defaults: surfaceDefaults({ cell: 42, icon: 32, gap: 6, mode: 'scale' }), minCell: 28, maxCell: 72, minIcon: 14, maxIcon: 56 },
  { id: 'auctionPreview', label: 'Аукционы: превью', description: 'Главная иконка лота и карточки аукциона', defaults: surfaceDefaults({ cell: 84, icon: 40, gap: 8, mode: 'scale' }), minCell: 48, maxCell: 120, minIcon: 18, maxIcon: 72 },
  { id: 'auctionLotItems', label: 'Аукционы: предметы', description: 'Предметы внутри открытого лота', defaults: surfaceDefaults({ cell: 42, icon: 28, gap: 6, mode: 'scale' }), minCell: 28, maxCell: 64, minIcon: 12, maxIcon: 48 },
  { id: 'auctionNei', label: 'Аукционы: NEI', description: 'Каталог предметов в рабочей области лота', defaults: surfaceDefaults({ cell: 40, icon: 26, gap: 6, mode: 'scale' }), minCell: 28, maxCell: 64, minIcon: 12, maxIcon: 48 },
  { id: 'touchHeld', label: 'Предмет под пальцем', description: 'Панель выбранного предмета на телефоне', defaults: surfaceDefaults({ cell: 44, icon: 32, gap: 8, mode: 'scale' }), minCell: 32, maxCell: 72, minIcon: 16, maxIcon: 56 },
  { id: 'mobileInspection', label: 'Мобильная подсказка', description: 'Иконки внутри мобильной подсказки', defaults: surfaceDefaults({ cell: 36, icon: 28, gap: 8, mode: 'scale' }), minCell: 28, maxCell: 64, minIcon: 12, maxIcon: 48 }
];

export const defaultIconSurfaceSettings = iconSurfaceDefinitions.reduce((acc, surface) => {
  acc[surface.id] = { ...surface.defaults };
  return acc;
}, {} as IconSurfaceSettingsMap);

export const defaultMobileIconSurfaceSettings: IconSurfaceSettingsMap = {
  ...defaultIconSurfaceSettings,
  nei: surfaceDefaults({ cell: 44, icon: 40, gap: 8, mode: 'scale' }),
  favorites: surfaceDefaults({ cell: 44, icon: 40, gap: 8, mode: 'scale' }),
  draftItems: surfaceDefaults({ cell: 38, icon: 30, gap: 6, mode: 'scale' }),
  craftGrid: surfaceDefaults({ cell: 42, icon: 28, gap: 2, mode: 'scale' }),
  craftGrid9: surfaceDefaults({ cell: 25, icon: 14, gap: 1, mode: 'scale' }),
  cubixCraftGrid: surfaceDefaults({ cell: 32, icon: 20, gap: 1, mode: 'absolute' }),
  craftOutput: surfaceDefaults({ cell: 36, icon: 24, gap: 0, mode: 'scale' }),
  draftPreview9: surfaceDefaults({ cell: 30, icon: 12, gap: 1, mode: 'scale' }),
  draftTemplateIcon: surfaceDefaults({ cell: 38, icon: 30, gap: 0, mode: 'scale' }),
  auctionPreview: surfaceDefaults({ cell: 72, icon: 34, gap: 8, mode: 'scale' }),
  auctionLotItems: surfaceDefaults({ cell: 40, icon: 26, gap: 6, mode: 'scale' }),
  auctionNei: surfaceDefaults({ cell: 42, icon: 30, gap: 7, mode: 'scale' }),
  touchHeld: surfaceDefaults({ cell: 44, icon: 32, gap: 8, mode: 'scale' }),
  mobileInspection: surfaceDefaults({ cell: 36, icon: 28, gap: 8, mode: 'scale' })
};

const modeSet = new Set<IconCenterMode>(['grid', 'absolute', 'wrapper', 'scale']);
const overflowSet = new Set<IconOverflowMode>(['clip', 'visible', 'scroll']);
const smoothingSet = new Set<IconSmoothingMode>(['pixelated', 'smooth']);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function numericOrFallback(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function normalizeIconSurfaceSettings(
  raw?: Partial<Record<string, Partial<IconSurfaceSettings>>> | null,
  defaults: IconSurfaceSettingsMap = defaultIconSurfaceSettings
): IconSurfaceSettingsMap {
  const source = raw && typeof raw === 'object' ? raw : {};
  return iconSurfaceDefinitions.reduce((acc, surface) => {
    const incoming = source[surface.id] ?? {};
    const fallback = defaults[surface.id] ?? surface.defaults;
    const cell = clamp(Math.round(numericOrFallback(incoming.cell, fallback.cell)), surface.minCell, surface.maxCell);
    const icon = clamp(Math.round(numericOrFallback(incoming.icon, fallback.icon)), surface.minIcon, surface.maxIcon);
    const gap = clamp(Math.round(numericOrFallback(incoming.gap, fallback.gap)), 0, 24);
    const gapX = clamp(Math.round(numericOrFallback(incoming.gapX ?? incoming.gap, fallback.gapX ?? gap)), 0, 24);
    const gapY = clamp(Math.round(numericOrFallback(incoming.gapY ?? incoming.gap, fallback.gapY ?? gap)), 0, 24);
    const padding = clamp(Math.round(numericOrFallback(incoming.padding, fallback.padding)), 0, 24);
    const borderWidth = clamp(Math.round(numericOrFallback(incoming.borderWidth, fallback.borderWidth)), 0, 4);
    const spriteScale = clamp(numericOrFallback(incoming.spriteScale, fallback.spriteScale), 0.5, 2.5);
    const offsetX = clamp(Math.round(numericOrFallback(incoming.offsetX, fallback.offsetX)), -24, 24);
    const offsetY = clamp(Math.round(numericOrFallback(incoming.offsetY, fallback.offsetY)), -24, 24);
    const mode = modeSet.has(incoming.mode as IconCenterMode) ? incoming.mode as IconCenterMode : fallback.mode;
    const overflow = overflowSet.has(incoming.overflow as IconOverflowMode) ? incoming.overflow as IconOverflowMode : fallback.overflow;
    const smoothing = smoothingSet.has(incoming.smoothing as IconSmoothingMode) ? incoming.smoothing as IconSmoothingMode : fallback.smoothing;
    acc[surface.id] = {
      cell, icon, gap, gapX, gapY, padding, borderWidth, spriteScale, offsetX, offsetY,
      overflow, smoothing, groupRows: Boolean(incoming.groupRows ?? fallback.groupRows), groupColumns: Boolean(incoming.groupColumns ?? fallback.groupColumns), mode
    };
    return acc;
  }, {} as IconSurfaceSettingsMap);
}

export function patchIconSurfaceSettings(
  current: Partial<Record<string, Partial<IconSurfaceSettings>>> | null | undefined,
  surfaceId: IconSurfaceId,
  next: IconSurfaceSettings,
  defaults: IconSurfaceSettingsMap = defaultIconSurfaceSettings
): IconSurfaceSettingsMap {
  return normalizeIconSurfaceSettings({
    ...(current ?? {}),
    [surfaceId]: next
  }, defaults);
}

export type IconViewport = {
  width: number;
  height: number;
};

export function isMobileIconViewport(viewport: IconViewport | null): boolean {
  return Boolean(viewport && viewport.width <= 760);
}

function dynamicCraftCell(surface: IconSurfaceSettings, viewport: IconViewport | null, gridSize: 3 | 9): number {
  if (!viewport) return surface.cell;
  const horizontalReserve = gridSize === 9 ? 168 : 220;
  const verticalReserve = gridSize === 9 ? 420 : 460;
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

function iconPlacementVars(prefix: string, value: IconSurfaceSettings): Record<string, string> {
  const centered = value.mode === 'absolute' || value.mode === 'scale';
  const scaled = value.mode === 'scale';
  const offset = value.offsetX || value.offsetY ? ` translate(${value.offsetX}px, ${value.offsetY}px)` : '';
  const spriteScale = value.spriteScale === 1 ? '' : ` scale(${value.spriteScale})`;
  const baseScale = ` scale(${value.icon / 32})`;
  return {
    [`${prefix}-render-position`]: centered ? 'absolute' : 'relative',
    [`${prefix}-render-left`]: centered ? '50%' : 'auto',
    [`${prefix}-render-top`]: centered ? '50%' : 'auto',
    [`${prefix}-render-width`]: scaled ? '32px' : `${value.icon}px`,
    [`${prefix}-render-height`]: scaled ? '32px' : `${value.icon}px`,
    [`${prefix}-render-transform`]: scaled
      ? `translate(-50%, -50%)${offset}${baseScale}${spriteScale}`
      : centered
        ? `translate(-50%, -50%)${offset}${spriteScale}`
        : `${offset}${spriteScale}` || 'none',
    [`${prefix}-gap-x`]: `${value.gapX}px`,
    [`${prefix}-gap-y`]: `${value.gapY}px`,
    [`${prefix}-padding`]: `${value.padding}px`,
    [`${prefix}-border-width`]: `${value.borderWidth}px`,
    [`${prefix}-sprite-scale`]: String(value.spriteScale),
    [`${prefix}-offset-x`]: `${value.offsetX}px`,
    [`${prefix}-offset-y`]: `${value.offsetY}px`,
    [`${prefix}-overflow`]: value.overflow,
    [`${prefix}-smoothing`]: value.smoothing === 'smooth' ? 'auto' : 'pixelated',
    [`${prefix}-group-row-gap`]: value.groupRows ? `${Math.max(value.gapY, value.gap + 2)}px` : '0px',
    [`${prefix}-group-column-gap`]: value.groupColumns ? `${Math.max(value.gapX, value.gap + 2)}px` : '0px'
  };
}

export function buildIconSurfaceCssVars(
  settings: Partial<Record<string, Partial<IconSurfaceSettings>>> | null | undefined,
  viewport: IconViewport | null,
  defaults: IconSurfaceSettingsMap = defaultIconSurfaceSettings
): CSSProperties {
  const normalized = normalizeIconSurfaceSettings(settings, defaults);
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
    Object.assign(vars, iconPlacementVars(prefix, value));
  });
  return vars as CSSProperties;
}
