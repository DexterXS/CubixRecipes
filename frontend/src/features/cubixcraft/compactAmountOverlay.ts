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

export function installCompactCubixAmounts(): void {
  if (typeof document === 'undefined') return;

  const run = () => updateAmountLabels();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();

  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'childList')) requestAnimationFrame(run);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
