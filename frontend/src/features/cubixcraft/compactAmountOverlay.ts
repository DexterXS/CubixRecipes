const SUFFIXES = [
  { value: 1e18, suffix: 'E' },
  { value: 1e15, suffix: 'P' },
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'G' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'k' }
] as const;

const FAVORITE_FILE_KEY = 'cubixcraft.favoriteCloudFile';
let initializedRecipeList: HTMLElement | null = null;
let favoriteAutoOpened = false;
let pendingPreferred: { groupTitle: string; variantIndex: number } | null = null;
let saveTimer: number | null = null;

export function formatCompactCubixAmount(amount: number): string {
  if (!Number.isFinite(amount)) return String(amount);
  const absolute = Math.abs(amount);
  const unit = SUFFIXES.find((candidate) => absolute >= candidate.value);
  if (!unit) return Math.trunc(amount).toString();

  const scaled = amount / unit.value;
  const decimals = Math.abs(scaled) < 10 && !Number.isInteger(scaled) ? 1 : 0;
  return `${scaled.toFixed(decimals).replace(/\.0$/, '')}${unit.suffix}`;
}

function parseAmount(text: string): number | null {
  const normalized = text.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function updateAmountLabels(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('.cubixcraft-grid .grid-cell > span').forEach((label) => {
    const source = label.dataset.fullAmount || label.textContent || '';
    const amount = parseAmount(source);
    if (amount === null) return;
    if (!label.dataset.fullAmount) label.dataset.fullAmount = String(Math.trunc(amount));
    label.textContent = formatCompactCubixAmount(amount);
    label.title = Math.trunc(amount).toLocaleString('ru-RU');
  });
}

function recipeSearchInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input[placeholder="Поиск рецепта"]');
}

function recipeList(): HTMLElement | null {
  const list = recipeSearchInput()?.nextElementSibling;
  return list instanceof HTMLElement ? list : null;
}

function recipeGroups(): HTMLElement[] {
  const list = recipeList();
  if (!list) return [];
  return Array.from(list.children).filter((entry): entry is HTMLElement => entry instanceof HTMLElement);
}

function groupHeader(group: HTMLElement): HTMLButtonElement | null {
  const first = group.firstElementChild;
  return first instanceof HTMLButtonElement ? first : null;
}

function groupTitle(group: HTMLElement): string {
  return groupHeader(group)?.querySelector('strong')?.textContent?.trim() ?? '';
}

function headerArrow(group: HTMLElement): string {
  return groupHeader(group)?.lastElementChild?.textContent?.trim() ?? '';
}

function isExpanded(group: HTMLElement): boolean {
  return headerArrow(group) === '▾';
}

function hasVariants(group: HTMLElement): boolean {
  const arrow = headerArrow(group);
  return arrow === '▾' || arrow === '▸';
}

function variantRows(group: HTMLElement): HTMLElement[] {
  const wrapper = Array.from(group.children).find((child, index) => index > 0 && child instanceof HTMLElement) as HTMLElement | undefined;
  if (!wrapper) return [];
  return Array.from(wrapper.children).filter((entry): entry is HTMLElement => entry instanceof HTMLElement);
}

function collapseNewRecipeListOnce(): void {
  const list = recipeList();
  if (!list || list === initializedRecipeList) return;
  const groups = recipeGroups();
  if (!groups.length) return;

  initializedRecipeList = list;
  groups.forEach((group) => {
    if (hasVariants(group) && isExpanded(group)) groupHeader(group)?.click();
  });
}

function cloudSelect(): HTMLSelectElement | null {
  return Array.from(document.querySelectorAll('select')).find((select) =>
    select.options.length > 0 && select.options[0]?.textContent?.trim() === 'Файл из облака…'
  ) ?? null;
}

function openCloudButton(select: HTMLSelectElement): HTMLButtonElement | null {
  const container = select.parentElement;
  if (!container) return null;
  return Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Открыть') ?? null;
}

function favoriteButton(select: HTMLSelectElement): HTMLButtonElement {
  let button = select.parentElement?.querySelector<HTMLButtonElement>('[data-cubix-favorite-file]') ?? null;
  if (button) return button;

  button = document.createElement('button');
  button.type = 'button';
  button.dataset.cubixFavoriteFile = '1';
  button.className = 'ghost-button';
  button.style.minWidth = '38px';
  button.style.paddingInline = '9px';
  button.title = 'Сделать выбранный файл файлом по умолчанию';
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const current = select.value;
    if (!current) return;
    const favorite = window.localStorage.getItem(FAVORITE_FILE_KEY);
    if (favorite === current) window.localStorage.removeItem(FAVORITE_FILE_KEY);
    else window.localStorage.setItem(FAVORITE_FILE_KEY, current);
    syncFavoriteFileUi();
  });
  select.insertAdjacentElement('afterend', button);
  return button;
}

function syncFavoriteFileUi(): void {
  const select = cloudSelect();
  if (!select) return;
  const button = favoriteButton(select);
  const favorite = window.localStorage.getItem(FAVORITE_FILE_KEY) ?? '';
  button.textContent = favorite && favorite === select.value ? '★' : '☆';
  button.title = favorite && favorite === select.value
    ? 'Этот файл открывается по умолчанию. Нажмите, чтобы убрать из избранного.'
    : 'Сделать выбранный файл файлом по умолчанию';
}

function autoOpenFavoriteFile(): void {
  if (favoriteAutoOpened) return;
  const select = cloudSelect();
  if (!select || select.options.length <= 1) return;
  syncFavoriteFileUi();

  const favorite = window.localStorage.getItem(FAVORITE_FILE_KEY);
  if (!favorite) {
    favoriteAutoOpened = true;
    return;
  }
  const optionExists = Array.from(select.options).some((option) => option.value === favorite);
  if (!optionExists) {
    favoriteAutoOpened = true;
    return;
  }

  favoriteAutoOpened = true;
  select.value = favorite;
  select.dispatchEvent(new Event('change', { bubbles: true }));
  syncFavoriteFileUi();
  window.setTimeout(() => openCloudButton(select)?.click(), 0);
}

function selectedGroup(): HTMLElement | null {
  return recipeGroups().find((group) => {
    const background = groupHeader(group)?.style.background ?? '';
    return background.includes('45, 126, 247') || background.includes('45,126,247');
  }) ?? null;
}

function rememberPreferredBeforeBackup(): void {
  const group = selectedGroup();
  if (!group) return;

  const rows = variantRows(group);
  let variantIndex = 0;
  rows.forEach((row, index) => {
    const button = row.querySelector<HTMLButtonElement>('button');
    const selected = Boolean(button?.style.borderColor) || (button?.style.background ?? '').includes('45, 126, 247');
    if (selected) variantIndex = index;
  });
  pendingPreferred = { groupTitle: groupTitle(group), variantIndex };
}

function applyPendingPreferred(): void {
  if (!pendingPreferred) return;
  const group = recipeGroups().find((entry) => groupTitle(entry) === pendingPreferred?.groupTitle);
  if (!group || !hasVariants(group)) return;

  if (!isExpanded(group)) {
    groupHeader(group)?.click();
    return;
  }

  const rows = variantRows(group);
  if (rows.length < 2) return;
  if (rows.some((row) => row.querySelector('button[title="Основной вариант"]'))) {
    pendingPreferred = null;
    return;
  }

  const index = Math.max(0, Math.min(rows.length - 1, pendingPreferred.variantIndex));
  const star = rows[index]?.querySelector<HTMLButtonElement>('button[title="Сделать основным"]');
  pendingPreferred = null;
  star?.click();
}

function scheduleCloudSave(): void {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    const save = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === 'Сохранить в облако');
    if (save && !save.disabled) save.click();
  }, 350);
}

function handleClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target.closest('button') : null;
  if (!(target instanceof HTMLButtonElement)) return;
  const text = target.textContent?.trim() ?? '';

  if (text === 'Сохранить как запасной вариант') rememberPreferredBeforeBackup();

  if (
    text === 'Сохранить рецепт' ||
    text === 'Заменить существующий' ||
    text === 'Сохранить как запасной вариант' ||
    target.title === 'Сделать основным' ||
    target.title === 'Основной вариант'
  ) {
    scheduleCloudSave();
  }
}

function runMaintenance(): void {
  updateAmountLabels();
  autoOpenFavoriteFile();
  syncFavoriteFileUi();
  collapseNewRecipeListOnce();
  applyPendingPreferred();
}

export function installCompactCubixAmounts(): void {
  if (typeof document === 'undefined') return;

  document.addEventListener('click', handleClick, true);
  document.addEventListener('change', (event) => {
    if (event.target === cloudSelect()) window.setTimeout(syncFavoriteFileUi, 0);
  });

  const run = () => runMaintenance();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'childList')) requestAnimationFrame(run);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
