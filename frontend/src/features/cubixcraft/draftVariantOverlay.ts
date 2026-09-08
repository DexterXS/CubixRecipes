import { apiPath, request } from '../../services/api/client';

const CALL_PREFIX = 'mods.cubixcraft.Astral.addRecipe';

type ServerVariant = {
  id: string;
  filePath: string;
  output: string;
  source: string;
  active: boolean;
};

let busy = false;

function cloudSelect(): HTMLSelectElement | null {
  return Array.from(document.querySelectorAll('select')).find((select) =>
    select.options.length > 0 && select.options[0]?.textContent?.trim() === 'Файл из облака…'
  ) ?? null;
}

function parseOutput(source: string): string {
  const start = source.indexOf(CALL_PREFIX);
  if (start < 0) return '';
  const tail = source.slice(start);
  return tail.match(/<[^>]+>/)?.[0] ?? '';
}

function selectedVariantRow(): HTMLElement | null {
  const list = document.querySelector<HTMLInputElement>('input[placeholder="Поиск рецепта"]')?.nextElementSibling;
  if (!(list instanceof HTMLElement)) return null;
  const rows = Array.from(list.querySelectorAll<HTMLElement>('div'));
  return rows.find((row) => {
    const first = row.querySelector<HTMLButtonElement>('button');
    if (!first) return false;
    const background = first.style.background ?? '';
    const border = first.style.borderColor ?? '';
    return background.includes('45, 126, 247') || background.includes('45,126,247') || Boolean(border);
  }) ?? null;
}

function currentSource(): string {
  let textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="cubixcraft-source"]');
  if (textarea) return textarea.value.trim();

  const sourceToggle = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.textContent?.includes('Исходный код рецепта')
  );
  sourceToggle?.click();
  textarea = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="cubixcraft-source"]');
  return textarea?.value.trim() ?? '';
}

async function saveCurrentRecipe(active: boolean, oldVariantId?: string): Promise<void> {
  if (busy) return;
  const filePath = cloudSelect()?.value ?? '';
  if (!filePath) return;

  const source = currentSource();
  const output = parseOutput(source);
  if (!source || !output) return;

  busy = true;
  try {
    const response = await request<{ variant: ServerVariant }>(apiPath('/admin/cubixcraft-variants'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath, output, source, active })
    });

    if (oldVariantId && oldVariantId !== response.variant.id) {
      await request(apiPath(`/admin/cubixcraft-variants/${encodeURIComponent(oldVariantId)}`), { method: 'DELETE' });
    }

    window.dispatchEvent(new CustomEvent('cubixcraft-server-state-changed'));
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  } finally {
    busy = false;
  }
}

function handleClick(event: MouseEvent): void {
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (!(button instanceof HTMLButtonElement)) return;
  const text = button.textContent?.trim() ?? '';
  if (text !== 'Сохранить рецепт' && text !== 'Сохранить как запасной вариант' && text !== 'Заменить существующий') return;

  const selected = selectedVariantRow();
  const oldVariantId = selected?.dataset.cubixVariantId;
  const keepActive = text === 'Заменить существующий' && selected?.dataset.cubixActive === '1';

  window.setTimeout(() => {
    void saveCurrentRecipe(keepActive, text === 'Заменить существующий' ? oldVariantId : undefined);
  }, 30);
}

export function installCubixCraftDraftVariants(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', handleClick, false);
}
