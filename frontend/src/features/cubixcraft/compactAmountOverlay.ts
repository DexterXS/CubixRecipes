const SUFFIXES = [
  { value: 1e18, suffix: 'E' },
  { value: 1e15, suffix: 'P' },
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'G' },
  { value: 1e6, suffix: 'M' },
  { value: 1e3, suffix: 'k' }
] as const;

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

function syncDefaultCollapsed(): void {
  recipeGroups().forEach((group) => {
    const rows = variantRows(group);
    const count = rows.length;
    const previousCount = Number(group.dataset.cubixVariantCount ?? '-1');
    group.dataset.cubixVariantCount = String(count);

    // Collapse only on first appearance or when the variant count changes.
    // A manual expand/collapse by the user is therefore left alone.
    if (count > 1 && count !== previousCount && isExpanded(group)) {
      groupHeader(group)?.click();
    }
  });
}

function rememberOldRecipeForBackup(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target.closest('button') : null;
  if (!(target instanceof HTMLButtonElement)) return;
  if (target.textContent?.trim() !== 'Сохранить как запасной вариант') return;

  const groups = recipeGroups();
  const selectedGroup = groups.find((group) => {
    const header = groupHeader(group);
    return Boolean(header?.style.background?.includes('45, 126, 247') || header?.style.background?.includes('45,126,247'));
  });
  if (!selectedGroup) return;

  const rows = variantRows(selectedGroup);
  let selectedIndex = 0;
  rows.forEach((row, index) => {
    const button = row.querySelector<HTMLButtonElement>('button');
    const border = button?.style.borderColor ?? '';
    const background = button?.style.background ?? '';
    if (border || background.includes('45, 126, 247') || background.includes('45,126,247')) selectedIndex = index;
  });

  selectedGroup.dataset.cubixPendingPreferred = String(selectedIndex);
}

function applyPendingPreferred(): void {
  recipeGroups().forEach((group) => {
    const pending = group.dataset.cubixPendingPreferred;
    if (pending === undefined) return;

    if (!isExpanded(group)) {
      groupHeader(group)?.click();
      return;
    }

    const rows = variantRows(group);
    if (rows.length < 2) return;

    const alreadyPreferred = rows.some((row) => row.querySelector<HTMLButtonElement>('button[title="Основной вариант"]'));
    if (alreadyPreferred) {
      delete group.dataset.cubixPendingPreferred;
      return;
    }

    const index = Math.max(0, Math.min(rows.length - 1, Number.parseInt(pending, 10) || 0));
    const star = rows[index]?.querySelector<HTMLButtonElement>('button[title="Сделать основным"]');
    delete group.dataset.cubixPendingPreferred;
    star?.click();
  });
}

export function installCompactCubixAmounts(): void {
  if (typeof document === 'undefined') return;

  const run = () => {
    updateAmountLabels();
    applyPendingPreferred();
    syncDefaultCollapsed();
  };

  document.addEventListener('click', rememberOldRecipeForBackup, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'childList')) requestAnimationFrame(run);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
