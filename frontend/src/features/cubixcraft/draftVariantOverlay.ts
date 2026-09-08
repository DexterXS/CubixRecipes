import { apiPath, request } from '../../services/api/client';
import { downloadZsCloudFile, uploadZsCloudFile } from '../../services/api/zsCloud';

const CALL_PREFIX = 'mods.cubixcraft.Astral.addRecipe';
const PREFERRED_MARKER = '// CubixRecipes:preferred';

type RecipeBlock = {
  start: number;
  end: number;
  output: string;
  source: string;
};

let busy = false;

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

function parseRecipes(text: string): RecipeBlock[] {
  const result: RecipeBlock[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const callStart = text.indexOf(CALL_PREFIX, cursor);
    if (callStart < 0) break;
    const open = text.indexOf('(', callStart + CALL_PREFIX.length);
    if (open < 0) break;
    const close = findMatchingParen(text, open);
    if (close < 0) break;
    let end = close + 1;
    while (end < text.length && /\s/.test(text[end]) && text[end] !== '\n' && text[end] !== '\r') end += 1;
    if (text[end] === ';') end += 1;

    let start = callStart;
    const lineStart = text.lastIndexOf('\n', Math.max(0, callStart - 1)) + 1;
    const previousLineEnd = lineStart > 0 ? lineStart - 1 : 0;
    const previousLineStart = previousLineEnd > 0 ? text.lastIndexOf('\n', previousLineEnd - 1) + 1 : 0;
    if (text.slice(previousLineStart, previousLineEnd).trim() === PREFERRED_MARKER) start = previousLineStart;

    const args = splitTopLevel(text.slice(open + 1, close));
    const output = (args[1] ?? '').match(/<[^>]+>/)?.[0] ?? '';
    if (output) result.push({ start, end, output, source: text.slice(start, end) });
    cursor = end;
  }
  return result;
}

function cloudSelect(): HTMLSelectElement | null {
  return Array.from(document.querySelectorAll('select')).find((select) =>
    select.options.length > 0 && select.options[0]?.textContent?.trim() === 'Файл из облака…'
  ) ?? null;
}

function openCloudButton(): HTMLButtonElement | null {
  const select = cloudSelect();
  const container = select?.parentElement;
  if (!container) return null;
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => button.textContent?.trim() === 'Открыть') ?? null;
}

function normalizedSource(source: string): string {
  return source.replace(`${PREFERRED_MARKER}\n`, '').trim();
}

function findAddedBlock(before: RecipeBlock[], after: RecipeBlock[]): RecipeBlock | null {
  const counts = new Map<string, number>();
  before.forEach((block) => {
    const key = normalizedSource(block.source);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });
  for (const block of after) {
    const key = normalizedSource(block.source);
    const count = counts.get(key) ?? 0;
    if (count > 0) {
      counts.set(key, count - 1);
      continue;
    }
    return block;
  }
  return null;
}

async function readCloudFile(path: string): Promise<{ text: string; blocks: RecipeBlock[] }> {
  const downloaded = await downloadZsCloudFile(path);
  const text = await downloaded.blob.text();
  return { text, blocks: parseRecipes(text) };
}

async function waitForAddedVariant(path: string, before: RecipeBlock[]): Promise<{ text: string; block: RecipeBlock } | null> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, attempt === 0 ? 450 : 180));
    const current = await readCloudFile(path);
    const block = findAddedBlock(before, current.blocks);
    if (block) return { text: current.text, block };
  }
  return null;
}

async function convertSavedBackupToDraft(path: string, before: RecipeBlock[]): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const added = await waitForAddedVariant(path, before);
    if (!added) throw new Error('Запасной вариант не появился в облачном файле. Попробуйте ещё раз.');

    await request(apiPath('/admin/cubixcraft-variants'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filePath: path,
        output: added.block.output,
        source: normalizedSource(added.block.source)
      })
    });

    let nextText = `${added.text.slice(0, added.block.start)}${added.text.slice(added.block.end)}`;
    nextText = nextText.replace(/\n{3,}/g, '\n\n');
    await uploadZsCloudFile(path, nextText, 'overwrite');

    const select = cloudSelect();
    if (select) select.dispatchEvent(new Event('change', { bubbles: true }));
    window.setTimeout(() => openCloudButton()?.click(), 50);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  } finally {
    busy = false;
  }
}

function handleClick(event: MouseEvent): void {
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (!(button instanceof HTMLButtonElement)) return;
  if (button.textContent?.trim() !== 'Сохранить как запасной вариант') return;

  const path = cloudSelect()?.value ?? '';
  if (!path) return;

  void readCloudFile(path)
    .then((before) => convertSavedBackupToDraft(path, before.blocks))
    .catch((error) => window.alert(error instanceof Error ? error.message : String(error)));
}

export function installCubixCraftDraftVariants(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', handleClick, true);
}
