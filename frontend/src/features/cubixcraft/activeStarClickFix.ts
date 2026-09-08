export function installCubixCraftActiveStarClickFix(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!(button instanceof HTMLButtonElement)) return;
    if (button.textContent?.trim() !== '★') return;
    const list = document.querySelector<HTMLInputElement>('input[placeholder="Поиск рецепта"]')?.nextElementSibling;
    if (!(list instanceof HTMLElement) || !list.contains(button)) return;
    if (button.closest('[data-cubix-archived-variant], [data-cubix-archived-only]')) return;
    button.title = 'Выключить рецепт (убрать из игрового .zs)';
  }, true);
}
