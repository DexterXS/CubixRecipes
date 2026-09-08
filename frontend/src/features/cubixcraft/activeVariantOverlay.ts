import { apiPath, request } from '../../services/api/client';
import { downloadZsCloudFile, uploadZsCloudFile } from '../../services/api/zsCloud';

const CALL_PREFIX = 'mods.cubixcraft.Astral.addRecipe';
const PREFERRED_MARKER = '// CubixRecipes:preferred';

type ServerVariant = {
  id: string;
  filePath: string;
  output: string;
  source: string;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type RecipeBlock = {
  start: number;
  end: number;
  output: string;
  source: string;
};

let variants: ServerVariant[] = [];
let loadedPath = '';
let busy = false;
let maintenanceQueued = false;
let syncedFingerprint = '';

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

function normalizeSource(source: string): string {
  return source
    .replace(`${PREFERRED_MARKER}\r\n`, '')
    .replace(`${PREFERRED_MARKER}\n`, '')
    .trim();
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
    if (output) result.push({ start, end, output, source: normalizeSource(text.slice(start, end)) });
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

function publishButton(): HTMLButtonElement | null {
  const select = cloudSelect();
  const container = select?.parentElement;
  if (!container) return null;
  return Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find((button) => {
    const text = button.textContent?.trim();
    return text === 'Сохранить в облако' || text === 'Обновить файл';
  }) ?? null;
}

function recipeList(): HTMLElement | null {
  const list = document.querySelector<HTMLInputElement>('input[placeholder="Поиск рецепта"]')?.nextElementSibling;
  return list instanceof HTMLElement ? list : null;
}

function activeGroups(): HTMLElement[] {
  const list = recipeList();
  if (!list) return [];
  return Array.from(list.children).filter((entry): entry is HTMLElement =>
    entry instanceof HTMLElement && !entry.dataset.cubixServerOnly
  );
}

function nativeVariantRows(group: HTMLElement): HTMLElement[] {
  const wrapper = Array.from(group.children).find((child, index) => index > 0 && child instanceof HTMLElement) as HTMLElement | undefined;
  if (!wrapper) return [];
  return Array.from(wrapper.children).filter((entry): entry is HTMLElement =>
    entry instanceof HTMLElement && !entry.dataset.cubixServerVariant
  );
}

function starButton(row: HTMLElement): HTMLButtonElement | null {
  const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>('button'));
  return buttons.find((button) => button.textContent?.trim() === '★' || button.textContent?.trim() === '☆') ?? null;
}

async function readCurrentFile(): Promise<{ path: string; text: string; blocks: RecipeBlock[] }> {
  const path = cloudSelect()?.value ?? '';
  if (!path) throw new Error('Сначала открой файл из облака.');
  const downloaded = await downloadZsCloudFile(path);
  const text = await downloaded.blob.text();
  return { path, text, blocks: parseRecipes(text) };
}

async function loadVariants(force = false): Promise<void> {
  const path = cloudSelect()?.value ?? '';
  if (!path) {
    variants = [];
    loadedPath = '';
    return;
  }
  if (!force && loadedPath === path) return;
  const response = await request<{ variants: ServerVariant[] }>(apiPath(`/admin/cubixcraft-variants?file_path=${encodeURIComponent(path)}`));
  loadedPath = path;
  variants = response.variants ?? [];
}

async function syncPublishedFile(): Promise<void> {
  const current = await readCurrentFile();
  const fingerprint = `${current.path}:${current.text.length}:${current.blocks.map((block) => block.source).join('|')}`;
  if (fingerprint === syncedFingerprint) return;

  await request(apiPath('/admin/cubixcraft-variants/sync'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      filePath: current.path,
      recipes: current.blocks.map((block) => ({ output: block.output, source: block.source }))
    })
  });
  syncedFingerprint = fingerprint;
  loadedPath = '';
  await loadVariants(true);
}

function uniqueOutputs(blocks: RecipeBlock[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  blocks.forEach((block) => {
    if (!seen.has(block.output)) {
      seen.add(block.output);
      result.push(block.output);
    }
  });
  return result;
}

function findVariant(output: string, source: string): ServerVariant | undefined {
  const normalized = normalizeSource(source);
  return variants.find((variant) => variant.output === output && normalizeSource(variant.source) === normalized);
}

function paintNativeRows(blocks: RecipeBlock[]): void {
  const groups = activeGroups();
  const outputs = uniqueOutputs(blocks);
  groups.forEach((group, groupIndex) => {
    const output = outputs[groupIndex];
    if (!output) return;
    group.dataset.cubixOutput = output;
    const matches = blocks.filter((block) => block.output === output);
    nativeVariantRows(group).forEach((row, rowIndex) => {
      const block = matches[rowIndex];
      if (!block) return;
      const variant = findVariant(output, block.source);
      if (!variant) return;
      row.dataset.cubixVariantId = variant.id;
      row.dataset.cubixActive = variant.active ? '1' : '0';
      const star = starButton(row);
      if (star) {
        star.textContent = variant.active ? '★' : '☆';
        star.title = variant.active ? 'Выключить рецепт' : 'Включить рецепт';
        star.style.color = variant.active ? '#ffd34d' : 'inherit';
      }
    });
  });
}

function createServerRow(variant: ServerVariant, label: string): HTMLElement {
  const row = document.createElement('div');
  row.dataset.cubixServerVariant = variant.id;
  row.dataset.cubixVariantId = variant.id;
  row.dataset.cubixActive = variant.active ? '1' : '0';
  row.style.display = 'grid';
  row.style.gridTemplateColumns = 'minmax(0,1fr) 30px 30px';
  row.style.gap = '4px';

  const info = document.createElement('button');
  info.type = 'button';
  info.className = 'ghost-button';
  info.disabled = true;
  info.style.textAlign = 'left';
  info.innerHTML = `<strong style="font-size:12px">${label}</strong><span style="display:block;font-size:10px;opacity:.68">сервер · ${variant.active ? 'активен' : 'без звезды'}</span>`;

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'ghost-button';
  star.textContent = variant.active ? '★' : '☆';
  star.title = variant.active ? 'Выключить рецепт' : 'Включить рецепт';
  star.style.padding = '0';
  star.style.fontSize = '18px';
  star.style.color = variant.active ? '#ffd34d' : 'inherit';

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'ghost-button cubixcraft-delete-variant';
  remove.textContent = '×';
  remove.title = 'Удалить полностью';

  row.append(info, star, remove);
  return row;
}

function addServerOnlyRows(blocks: RecipeBlock[]): void {
  const list = recipeList();
  if (!list) return;
  list.querySelectorAll('[data-cubix-server-variant], [data-cubix-server-only]').forEach((node) => node.remove());

  const represented = new Set(blocks.map((block) => `${block.output}\0${normalizeSource(block.source)}`));
  const extras = variants.filter((variant) => !represented.has(`${variant.output}\0${normalizeSource(variant.source)}`));
  const groupsByOutput = new Map(activeGroups().map((group) => [group.dataset.cubixOutput ?? '', group]));

  extras.forEach((variant) => {
    const existing = groupsByOutput.get(variant.output);
    if (existing) {
      const wrapper = Array.from(existing.children).find((child, index) => index > 0 && child instanceof HTMLElement) as HTMLElement | undefined;
      if (wrapper) wrapper.appendChild(createServerRow(variant, 'Серверный вариант'));
      return;
    }

    const group = document.createElement('div');
    group.dataset.cubixServerOnly = variant.output;
    group.style.border = '1px solid rgba(255,255,255,.1)';
    group.style.borderRadius = '8px';
    group.style.overflow = 'hidden';
    group.style.background = '#0f1a2b';

    const header = document.createElement('div');
    header.style.padding = '8px';
    header.innerHTML = `<strong style="display:block;font-size:13px">${variant.output}</strong><span style="font-size:11px;opacity:.68">хранится на сервере</span>`;
    const wrapper = document.createElement('div');
    wrapper.style.display = 'grid';
    wrapper.style.gap = '4px';
    wrapper.style.padding = '0 6px 6px';
    wrapper.appendChild(createServerRow(variant, 'Вариант 1'));
    group.append(header, wrapper);
    list.appendChild(group);
    groupsByOutput.set(variant.output, group);
  });
}

async function setVariantActive(id: string, active: boolean): Promise<void> {
  const response = await request<{ variant: ServerVariant }>(apiPath(`/admin/cubixcraft-variants/${encodeURIComponent(id)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active })
  });
  variants = variants.map((variant) => variant.id === id ? response.variant : variant);
  queueMaintenance();
}

function withoutRecipeBlocks(text: string, blocks: RecipeBlock[]): string {
  let result = text;
  [...blocks].sort((a, b) => b.start - a.start).forEach((block) => {
    result = `${result.slice(0, block.start)}${result.slice(block.end)}`;
  });
  return result.replace(/\n{3,}/g, '\n\n').trimEnd();
}

async function publishFile(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    await loadVariants(true);
    const current = await readCurrentFile();
    const base = withoutRecipeBlocks(current.text, current.blocks);
    const activeSources = variants.filter((variant) => variant.active).map((variant) => normalizeSource(variant.source));
    const separator = base ? '\n\n' : '';
    const nextText = `${base}${separator}${activeSources.join('\n\n')}${activeSources.length ? '\n' : ''}`;
    await uploadZsCloudFile(current.path, nextText, 'overwrite');
    syncedFingerprint = '';
    window.setTimeout(() => openCloudButton()?.click(), 40);
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  } finally {
    busy = false;
  }
}

async function syncUi(): Promise<void> {
  const button = publishButton();
  if (button) {
    button.textContent = 'Обновить файл';
    button.title = 'Записать в .zs только рецепты со звездой';
  }
  const path = cloudSelect()?.value ?? '';
  if (!path || !recipeList()) return;

  try {
    await syncPublishedFile();
    const current = await readCurrentFile();
    paintNativeRows(current.blocks);
    addServerOnlyRows(current.blocks);
  } catch (error) {
    console.error('CubixCraft server-state sync failed', error);
  }
}

function queueMaintenance(): void {
  if (maintenanceQueued) return;
  maintenanceQueued = true;
  requestAnimationFrame(() => {
    maintenanceQueued = false;
    void syncUi();
  });
}

function handleCaptureClick(event: MouseEvent): void {
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (!(button instanceof HTMLButtonElement)) return;

  const text = button.textContent?.trim() ?? '';
  if (text === 'Обновить файл') {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void publishFile();
    return;
  }

  if (text !== '★' && text !== '☆') return;
  const row = button.closest<HTMLElement>('[data-cubix-variant-id]');
  if (!row) return;
  const id = row.dataset.cubixVariantId;
  if (!id) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void setVariantActive(id, row.dataset.cubixActive !== '1');
}

function isSyntheticNode(node: Node): boolean {
  return node instanceof Element && Boolean(node.closest('[data-cubix-server-variant], [data-cubix-server-only]'));
}

export function installCubixCraftActiveVariants(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', handleCaptureClick, true);
  document.addEventListener('change', (event) => {
    if (event.target === cloudSelect()) {
      loadedPath = '';
      syncedFingerprint = '';
      variants = [];
      queueMaintenance();
    }
  });
  window.addEventListener('cubixcraft-server-state-changed', () => {
    loadedPath = '';
    queueMaintenance();
  });
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      if (mutation.type !== 'childList') return false;
      return [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)].some((node) => !isSyntheticNode(node));
    });
    if (relevant) queueMaintenance();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  queueMaintenance();
}
