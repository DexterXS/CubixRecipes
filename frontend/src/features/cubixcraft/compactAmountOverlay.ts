const SUFFIXES = [
  { value: 1e18, suffix: 'E' },
  { value: 1e15, suffix: 'P' },
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'G' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'k' }
] as const;

const initializedGroups = new Set<string>();
let pendingPreferred: { key: string; index: number } | null = null;

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

function recipeGroups(): HTMLElement[] {
  const search = document.querySelector<HTMLInputElement>('input[placeholder="Поиск рецепта"]');
  const list = search?.nextElementSibling;
  if (!(list instanceof HTMLElement)) return [];
  return Array.from(list.children).filter((entry): entry is HTMLElement => entry instanceof HTMLElement);
}

function groupHeader(group: HTMLElement): HTMLButtonElement | null {
  const first = group.firstElementChild;
  return first instanceof HTMLButtonElement ? first : null;
}

function groupKey(group: HTMLElement): string {
  const header = groupHeader(group);
  const title = header?.querySelector('strong')?.textContent?.trim() ?? '';
  return title || header?.textContent?.trim() || '';
}

function variantRows(group: HTMLElement): HTMLElement[] {
  const wrapper = Array.from(group.children).find((child, index) => index > 0 && child instanceof HTMLElement) as HTMLElement | undefined;
  if (!wrapper) return [];
  return Array.from(wrapper.children).filter((entry): entry is HTMLElement => entry instanceof HTMLElement);
}

function isExpanded(group: HTMLElement): boolean {
  const header = groupHeader(group);
  const arrow = header?.lastElementChild?.textContent?.trim();
  return arrow === '▾';
}

function hasVariants(group: HTMLElement): boolean {
  const header = groupHeader(group);
  const arrow = header?.lastElementChild?.textContent?.trim();
  return arrow === '▾' || arrow === '▸';
}

function collapseInitiallyOnce(): void {
  recipeGroups().forEach((group) => {
    if (!hasVariants(group)) return;
    const key = groupKey(group);
    if (!key || initializedGroups.has(key)) return;

    initializedGroups.add(key);
    if (isExpanded(group)) groupHeader(group)?.click();
  });
}

function isSelectedGroup(group: HTMLElement): boolean {
  const header = groupHeader(group);
  const background = header?.style.background ?? '';
  return background.includes('45, 126, 247') || background.includes('45,126,247');
}

function rememberOldRecipeForBackup(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target.closest('button') : null;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.textContent?.trim() !== 'Сохранить как запасной вариант') return;

  const selectedGroup = recipeGroups().find(isSelectedGroup);
  if (!selectedGroup) return;

  const key = groupKey(selectedGroup);
  if (!key) return;

  const rows = variantRows(selectedGroup);
  let selectedIndex = 0;
  rows.forEach((row, index) => {
    const button = row.querySelector<HTMLButtonElement>('button');
    const border = button?.style.borderColor ?? '';
    const background = button?.style.background ?? '';
    if (border || background.includes('45, 126, 247') || background.includes('45,126,247')) selectedIndex = index;
  });

  pendingPreferred = { key, index: selectedIndex };
  initializedGroups.add(key);
}

function applyPendingPreferred(): void {
  if (!pendingPreferred) return;

  const group = recipeGroups().find((entry) => groupKey(entry) === pendingPreferred?.key);
  if (!group) return;

  initializedGroups.add(pendingPreferred.key);

  if (!isExpanded(group)) {
    groupHeader(group)?.click();
    return;
  }

  const rows = variantRows(group);
  if (rows.length < 2) return;

  const alreadyPreferred = rows.some((row) => row.querySelector<HTMLButtonElement>('button[title="Основной вариант"]'));
  if (alreadyPreferred) {
    pendingPreferred = null;
    return;
  }

  const index = Math.max(0, Math.min(rows.length - 1, pendingPreferred.index));
  const star = rows[index]?.querySelector<HTMLButtonElement>('button[title="Сделать основным"]');
  pendingPreferred = null;
  star?.click();
}

export function installCompactCubixAmounts(): void {
  if (typeof document === 'undefined') return;

  const run = () => {
    updateAmountLabels();
    applyPendingPreferred();
    collapseInitiallyOnce();
  };

  document.addEventListener('click', rememberOldRecipeForBackup, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'childList')) requestAnimationFrame(run);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
