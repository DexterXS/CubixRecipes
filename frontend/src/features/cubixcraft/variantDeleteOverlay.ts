import { downloadZsCloudFile, uploadZsCloudFile } from '../../services/api';

const CALL_PREFIX = 'mods.cubixcraft.Astral.addRecipe';
const PREFERRED_MARKER = '// CubixRecipes:preferred';

type RecipeBlock = {
  start: number;
  end: number;
  output: string;
};

function cloudSelect(): HTMLSelectElement | null {
  return Array.from(document.querySelectorAll('select')).find((select) =>
    select.options.length > 0 && select.options[0]?.textContent?.trim() === 'Файл из облака…'
  ) ?? null;
}

function recipeSearchInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>('input[placeholder="Поиск рецепта"]');
}

function recipeList(): HTMLElement | null {
  const list = recipeSearchInput()?.nextElementSibling;
  return list instanceof HTMLElement ? list : null;
}

function variantWrappers(): HTMLElement[] {
  const list = recipeList();
  if (!list) return [];
  const result: HTMLElement[] = [];
  Array.from(list.children).forEach((group) => {
    if (!(group instanceof HTMLElement)) return;
    const wrapper = Array.from(group.children).find((child, index) => index > 0 && child instanceof HTMLElement);
    if (wrapper instanceof HTMLElement) result.push(wrapper);
  });
  return result;
}

function currentOutputRaw(): string {
  const resultLabel = Array.from(document.querySelectorAll('span')).find((span) => span.textContent?.trim() === 'Результат');
  const container = resultLabel?.parentElement;
  if (!container) return '';
  const labels = Array.from(container.children).filter((child): child is HTMLSpanElement => child instanceof HTMLSpanElement);
  const raw = labels.at(-1)?.textContent?.trim() ?? '';
  return raw === 'пусто' ? '' : raw;
}

function findMatchingParen(text: string, openIndex: number): number {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = openIndex; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(') depth += 1;
    else if (char === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function splitTopLevel(text: string): string[] {
  const result: string[] = [];
  let start = 0;
  let round = 0;
  let square = 0;
  let curly = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") { quote = char; continue; }
    if (char === '(') round += 1;
    else if (char === ')') round -= 1;
    else if (char === '[') square += 1;
    else if (char === ']') square -= 1;
    else if (char === '{') curly += 1;
    else if (char === '}') curly -= 1;
    else if (char === ',' && round === 0 && square === 0 && curly === 0) {
      result.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(text.slice(start).trim());
  return result;
}

function preferredStart(text: string, callStart: number): number {
  const currentLineStart = text.lastIndexOf('\n', Math.max(0, callStart - 1)) + 1;
  const previousLineEnd = currentLineStart > 0 ? currentLineStart - 1 : 0;
  const previousLineStart = previousLineEnd > 0 ? text.lastIndexOf('\n', previousLineEnd - 1) + 1 : 0;
  return text.slice(previousLineStart, previousLineEnd).trim() === PREFERRED_MARKER ? previousLineStart : callStart;
}

function recipeBlocks(text: string): RecipeBlock[] {
  const blocks: RecipeBlock[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const callStart = text.indexOf(CALL_PREFIX, cursor);
    if (callStart < 0) break;
    const open = text.indexOf('(', callStart + CALL_PREFIX.length);
    if (open < 0) break;
    const close = findMatchingParen(text, open);
    if (close < 0) break;
    const args = splitTopLevel(text.slice(open + 1, close));
    const output = (args[1] ?? '').match(/<[^>]+>/)?.[0] ?? '';
    let end = close + 1;
    while (end < text.length && (text[end] === ' ' || text[end] === '\t' || text[end] === '\r')) end += 1;
    if (text[end] === ';') end += 1;
    if (text[end] === '\r') end += 1;
    if (text[end] === '\n') end += 1;
    blocks.push({ start: preferredStart(text, callStart), end, output });
    cursor = close + 1;
  }
  return blocks;
}

async function deleteVariant(row: HTMLElement, wrapper: HTMLElement) {
  const rows = Array.from(wrapper.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  const variantIndex = rows.indexOf(row);
  if (variantIndex < 0) return;

  const variantButton = row.querySelector<HTMLButtonElement>('button:not([data-cubix-delete-variant])');
  variantButton?.click();
  await new Promise((resolve) => window.setTimeout(resolve, 0));

  const output = currentOutputRaw();
  if (!output) {
    window.alert('Не удалось определить выходной предмет рецепта.');
    return;
  }

  if (!window.confirm(`Удалить вариант ${variantIndex + 1} для ${output}?\n\nЭто удалит рецепт из файла на сервере.`)) return;

  const select = cloudSelect();
  if (!select?.value) {
    window.alert('Удаление с сервера доступно только для открытого файла из облака.');
    return;
  }

  try {
    const downloaded = await downloadZsCloudFile(select.value);
    const text = await downloaded.blob.text();
    const matches = recipeBlocks(text).filter((block) => block.output === output);
    const target = matches[variantIndex];
    if (!target) throw new Error('Вариант не найден в файле');

    const nextText = `${text.slice(0, target.start)}${text.slice(target.end)}`.replace(/\n{3,}/g, '\n\n');
    await uploadZsCloudFile(select.value, nextText, 'overwrite');

    const open = Array.from(select.parentElement?.querySelectorAll('button') ?? []).find((button) => button.textContent?.trim() === 'Открыть');
    open?.click();
  } catch (error) {
    window.alert(`Не удалось удалить рецепт: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function injectDeleteButtons() {
  variantWrappers().forEach((wrapper) => {
    const rows = Array.from(wrapper.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    rows.forEach((row) => {
      if (row.querySelector('[data-cubix-delete-variant]')) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.cubixDeleteVariant = '1';
      button.className = 'ghost-button cubixcraft-delete-variant';
      button.title = 'Удалить вариант';
      button.textContent = '×';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        void deleteVariant(row, wrapper);
      });
      row.appendChild(button);
    });
  });
}

export function installCubixCraftVariantDelete(): void {
  if (typeof document === 'undefined') return;
  const run = () => injectDeleteButtons();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
  else run();
  const observer = new MutationObserver((mutations) => {
    if (mutations.some((mutation) => mutation.type === 'childList')) requestAnimationFrame(run);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}
