let installed = false;
let cursorElement: HTMLElement | null = null;
let pointerX = 0;
let pointerY = 0;

function findCursor(): HTMLElement | null {
  if (cursorElement?.isConnected) return cursorElement;
  const root = document.querySelector('.cubixcraft-embedded');
  if (!root) return null;
  const candidates = root.querySelectorAll<HTMLElement>('div[style*="z-index: 10000"]');
  cursorElement = Array.from(candidates).find((element) => element.style.position === 'fixed' && element.style.pointerEvents === 'none') ?? null;
  return cursorElement;
}

function placeCursor() {
  const cursor = findCursor();
  if (!cursor) return;
  cursor.style.position = 'fixed';
  cursor.style.left = '0px';
  cursor.style.top = '0px';
  cursor.style.transform = `translate3d(${pointerX + 12}px, ${pointerY + 12}px, 0)`;
  cursor.style.zIndex = '10000';
  cursor.style.pointerEvents = 'none';
  cursor.style.willChange = 'transform';
}

export function installCubixCraftHeldCursorFix() {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;

  window.addEventListener('pointermove', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    placeCursor();
  }, { passive: true, capture: true });

  document.addEventListener('pointerdown', (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    window.requestAnimationFrame(placeCursor);
  }, { passive: true, capture: true });

  const observer = new MutationObserver(() => {
    if (cursorElement && !cursorElement.isConnected) cursorElement = null;
    if (document.body.classList.contains('cubixcraft-integrated')) {
      window.requestAnimationFrame(placeCursor);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
