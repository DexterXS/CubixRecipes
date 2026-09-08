const POSITION_KEY_PREFIX = 'cubixcraft.archivedPositions:';

function cloudPath(): string {
  const select = Array.from(document.querySelectorAll('select')).find((entry) =>
    entry.options.length > 0 && entry.options[0]?.textContent?.trim() === 'Файл из облака…'
  );
  return select?.value ?? '';
}

function recipeList(): HTMLElement | null {
  const input = document.querySelector<HTMLInputElement>('input[placeholder="Поиск рецепта"]');
  const list = input?.nextElementSibling;
  return list instanceof HTMLElement ? list : null;
}

function readPositions(): Record<string, number> {
  const path = cloudPath();
  if (!path) return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(`${POSITION_KEY_PREFIX}${path}`) ?? '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, number> : {};
  } catch {
    return {};
  }
}

function rememberPosition(group: HTMLElement): void {
  const list = recipeList();
  const path = cloudPath();
  const output = group.dataset.cubixOutput ?? '';
  if (!list || !path || !output) return;
  const index = Array.from(list.children).indexOf(group);
  if (index < 0) return;
  const positions = readPositions();
  positions[output] = index;
  window.localStorage.setItem(`${POSITION_KEY_PREFIX}${path}`, JSON.stringify(positions));
}

function archivedOutput(group: HTMLElement): string {
  return group.querySelector('strong')?.textContent?.trim() ?? '';
}

function restorePositions(): void {
  const list = recipeList();
  if (!list) return;
  const positions = readPositions();
  const archived = Array.from(list.children).filter((node): node is HTMLElement =>
    node instanceof HTMLElement && Boolean(node.dataset.cubixArchivedOnly)
  );
  archived.forEach((group) => {
    const output = archivedOutput(group);
    const targetIndex = positions[output];
    if (!Number.isInteger(targetIndex)) return;
    const siblings = Array.from(list.children).filter((node) => node !== group);
    const target = siblings[Math.max(0, Math.min(targetIndex, siblings.length))] ?? null;
    if (target) list.insertBefore(group, target);
    else list.appendChild(group);
  });
}

export function installCubixCraftArchivedPositionFix(): void {
  if (typeof document === 'undefined') return;

  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!(button instanceof HTMLButtonElement) || button.textContent?.trim() !== '★') return;
    const row = button.parentElement;
    const wrapper = row?.parentElement;
    const group = wrapper?.parentElement;
    if (group instanceof HTMLElement && !group.dataset.cubixArchivedOnly) rememberPosition(group);
  }, true);

  const observer = new MutationObserver(() => requestAnimationFrame(restorePositions));
  observer.observe(document.documentElement, { childList: true, subtree: true });
  requestAnimationFrame(restorePositions);
}
