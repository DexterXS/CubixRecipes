let retrying = false;

function recipeGroupFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const header = target.closest('button');
  if (!(header instanceof HTMLButtonElement)) return null;
  const group = header.parentElement;
  const search = document.querySelector<HTMLInputElement>('input[placeholder="Поиск рецепта"]');
  const list = search?.nextElementSibling;
  if (!(list instanceof HTMLElement) || group?.parentElement !== list) return null;
  const arrow = header.lastElementChild?.textContent?.trim();
  return arrow === '▸' || arrow === '▾' ? group : null;
}

function headerOf(group: HTMLElement): HTMLButtonElement | null {
  return group.firstElementChild instanceof HTMLButtonElement ? group.firstElementChild : null;
}

function selectVisibleVariant(group: HTMLElement): void {
  const wrapper = Array.from(group.children).find((child, index) => index > 0 && child instanceof HTMLElement) as HTMLElement | undefined;
  if (!wrapper) return;
  const preferred = wrapper.querySelector<HTMLButtonElement>('button[title="Основной вариант"]')?.parentElement?.querySelector<HTMLButtonElement>('button:first-child');
  const first = wrapper.querySelector<HTMLButtonElement>('div > button:first-child');
  (preferred ?? first)?.click();
}

export function installCubixVariantInteractionFix(): void {
  if (typeof document === 'undefined') return;

  document.addEventListener('click', (event) => {
    if (retrying) return;
    const group = recipeGroupFromTarget(event.target);
    if (!group) return;
    const header = headerOf(group);
    if (!header) return;
    const before = header.lastElementChild?.textContent?.trim();

    window.setTimeout(() => {
      const currentHeader = headerOf(group);
      if (!currentHeader) return;
      let after = currentHeader.lastElementChild?.textContent?.trim();

      // If another listener prevented the React handler, retry the exact header click once.
      if (before === '▸' && after === '▸') {
        retrying = true;
        currentHeader.click();
        retrying = false;
        after = currentHeader.lastElementChild?.textContent?.trim();
      }

      if (after === '▾') window.setTimeout(() => selectVisibleVariant(group), 0);
    }, 0);
  }, true);
}
