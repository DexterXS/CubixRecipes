import { apiPath, request } from '../../services/api/client';
import { downloadZsCloudFile, uploadZsCloudFile } from '../../services/api/zsCloud';

const CALL_PREFIX = 'mods.cubixcraft.Astral.addRecipe';
const PREFERRED_MARKER = '// CubixRecipes:preferred';

type ArchivedVariant = {
  id: string;
  filePath: string;
  output: string;
  source: string;
  createdAt?: string;
  updatedAt?: string;
};

type ActiveRecipeBlock = {
  start: number;
  end: number;
  output: string;
  source: string;
};

let archivePath = '';
let archiveVariants: ArchivedVariant[] = [];
let archiveLoading = false;
let busy = false;
let maintenanceQueued = false;

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

function parseActiveRecipes(text: string): ActiveRecipeBlock[] {
  const result: ActiveRecipeBlock[] = [];
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

function recipeList(): HTMLElement | null {
  const input = document.querySelector<HTMLInputElement>('input[placeholder="Поиск рецепта"]');
  const list = input?.nextElementSibling;
  return list instanceof HTMLElement ? list : null;
}

function activeGroups(): HTMLElement[] {
  const list = recipeList();
  if (!list) return [];
  return Array.from(list.children).filter((entry): entry is HTMLElement =>
    entry instanceof HTMLElement && !entry.dataset.cubixArchivedOnly
  );
}

function nativeVariantRows(group: HTMLElement): HTMLElement[] {
  const wrapper = Array.from(group.children).find((child, index) => index > 0 && child instanceof HTMLElement) as HTMLElement | undefined;
  if (!wrapper) return [];
  return Array.from(wrapper.children).filter((entry): entry is HTMLElement =>
    entry instanceof HTMLElement && !entry.dataset.cubixArchivedVariant
  );
}

async function loadArchive(force = false): Promise<void> {
  const path = cloudSelect()?.value ?? '';
  if (!path) {
    archivePath = '';
    archiveVariants = [];
    return;
  }
  if (!force && (archiveLoading || archivePath === path)) return;
  archiveLoading = true;
  try {
    const response = await request<{ variants: ArchivedVariant[] }>(apiPath(`/admin/cubixcraft-variants?file_path=${encodeURIComponent(path)}`));
    archivePath = path;
    archiveVariants = response.variants ?? [];
  } catch (error) {
    console.error('Failed to load CubixCraft archived variants', error);
  } finally {
    archiveLoading = false;
  }
}

function uniqueOutputs(blocks: ActiveRecipeBlock[]): string[] {
  const seen = new Set<string>();
  const outputs: string[] = [];
  blocks.forEach((block) => {
    if (!seen.has(block.output)) {
      seen.add(block.output);
      outputs.push(block.output);
    }
  });
  return outputs;
}

async function readCurrentFile(): Promise<{ path: string; text: string; blocks: ActiveRecipeBlock[] }> {
  const path = cloudSelect()?.value ?? '';
  if (!path) throw new Error('Сначала открой файл из облака.');
  const downloaded = await downloadZsCloudFile(path);
  const text = await downloaded.blob.text();
  return { path, text, blocks: parseActiveRecipes(text) };
}

async function refreshOpenedFile(): Promise<void> {
  await loadArchive(true);
  window.setTimeout(() => openCloudButton()?.click(), 40);
  window.setTimeout(queueMaintenance, 120);
}

async function disableActiveVariant(group: HTMLElement, row: HTMLElement): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const current = await readCurrentFile();
    const groups = activeGroups();
    const groupIndex = groups.indexOf(group);
    const output = uniqueOutputs(current.blocks)[groupIndex];
    if (!output) throw new Error('Не удалось определить output варианта.');
    const rowIndex = nativeVariantRows(group).indexOf(row);
    const matches = current.blocks.filter((block) => block.output === output);
    const block = matches[rowIndex];
    if (!block) throw new Error('Не удалось определить рецепт для отключения.');

    await request(apiPath('/admin/cubixcraft-variants'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath: current.path, output: block.output, source: block.source })
    });

    let nextText = `${current.text.slice(0, block.start)}${current.text.slice(block.end)}`;
    nextText = nextText.replace(/\n{3,}/g, '\n\n');
    await uploadZsCloudFile(current.path, nextText, 'overwrite');
    await refreshOpenedFile();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  } finally {
    busy = false;
  }
}

async function enableArchivedVariant(variant: ArchivedVariant): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const current = await readCurrentFile();
    const separator = current.text.endsWith('\n') ? '\n' : '\n\n';
    const source = variant.source.replace(`${PREFERRED_MARKER}\n`, '');
    await uploadZsCloudFile(current.path, `${current.text}${separator}${source}\n`, 'overwrite');
    await request(apiPath(`/admin/cubixcraft-variants/${encodeURIComponent(variant.id)}`), { method: 'DELETE' });
    await refreshOpenedFile();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  } finally {
    busy = false;
  }
}

async function hardDeleteArchivedVariant(variant: ArchivedVariant): Promise<void> {
  if (!window.confirm('Удалить этот запасной рецепт полностью из серверного хранилища?')) return;
  try {
    await request(apiPath(`/admin/cubixcraft-variants/${encodeURIComponent(variant.id)}`), { method: 'DELETE' });
    await loadArchive(true);
    queueMaintenance();
  } catch (error) {
    window.alert(error instanceof Error ? error.message : String(error));
  }
}

function archivedRow(variant: ArchivedVariant, label: string): HTMLElement {
  const row = document.createElement('div');
  row.dataset.cubixArchivedVariant = variant.id;
  row.style.display = 'grid';
  row.style.gridTemplateColumns = 'minmax(0,1fr) 30px 30px';
  row.style.gap = '4px';
  row.style.minHeight = '38px';
  row.style.background = '#111f33';
  row.style.border = '1px solid rgba(255,255,255,.08)';
  row.style.borderRadius = '7px';

  const info = document.createElement('button');
  info.type = 'button';
  info.className = 'ghost-button';
  info.disabled = true;
  info.style.textAlign = 'left';
  info.style.opacity = '0.75';
  info.innerHTML = `<strong style="font-size:12px">${label}</strong><span style="display:block;font-size:10px;opacity:.68">выключен · хранится на сервере</span>`;

  const star = document.createElement('button');
  star.type = 'button';
  star.className = 'ghost-button';
  star.textContent = '☆';
  star.title = 'Включить рецепт в игре';
  star.style.padding = '0';
  star.style.fontSize = '18px';
  star.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void enableArchivedVariant(variant);
  });

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'ghost-button cubixcraft-delete-variant';
  remove.textContent = '×';
  remove.title = 'Удалить полностью';
  remove.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    void hardDeleteArchivedVariant(variant);
  });

  row.append(info, star, remove);
  return row;
}

function syncUi(): void {
  const list = recipeList();
  if (!list) return;

  list.querySelectorAll('[data-cubix-archived-only], [data-cubix-archived-variant]').forEach((node) => node.remove());

  const groups = activeGroups();
  const path = cloudSelect()?.value ?? '';
  if (!path) return;

  void readCurrentFile().then(({ blocks }) => {
    const outputs = uniqueOutputs(blocks);
    groups.forEach((group, groupIndex) => {
      const output = outputs[groupIndex];
      if (!output) return;
      group.dataset.cubixOutput = output;

      const wrapper = Array.from(group.children).find((child, index) => index > 0 && child instanceof HTMLElement) as HTMLElement | undefined;
      const nativeRows = nativeVariantRows(group);
      nativeRows.forEach((row) => {
        const star = row.querySelector<HTMLButtonElement>('button[title="Сделать основным"], button[title="Основной вариант"], button[title="Выключить рецепт (убрать из игрового .zs)"]');
        if (star) {
          star.textContent = '★';
          star.title = 'Выключить рецепт (убрать из игрового .zs)';
          star.style.color = '#ffd34d';
        }
      });

      if (wrapper) {
        archiveVariants.filter((variant) => variant.output === output).forEach((variant, index) => {
          wrapper.appendChild(archivedRow(variant, `Запасной ${nativeRows.length + index + 1}`));
        });
      }
    });

    const activeOutputs = new Set(outputs);
    const archiveOnly = archiveVariants.filter((variant) => !activeOutputs.has(variant.output));
    const byOutput = new Map<string, ArchivedVariant[]>();
    archiveOnly.forEach((variant) => {
      const items = byOutput.get(variant.output) ?? [];
      items.push(variant);
      byOutput.set(variant.output, items);
    });

    byOutput.forEach((variants, output) => {
      const group = document.createElement('div');
      group.dataset.cubixArchivedOnly = '1';
      group.style.border = '1px solid rgba(255,255,255,.1)';
      group.style.borderRadius = '8px';
      group.style.overflow = 'hidden';
      group.style.background = '#0f1a2b';

      const header = document.createElement('div');
      header.style.padding = '8px';
      header.innerHTML = `<strong style="display:block;font-size:13px">${output}</strong><span style="font-size:11px;opacity:.68">${variants.length} выключенных · 0 активных</span>`;
      group.appendChild(header);

      const wrapper = document.createElement('div');
      wrapper.style.display = 'grid';
      wrapper.style.gap = '4px';
      wrapper.style.padding = '0 6px 6px';
      variants.forEach((variant, index) => wrapper.appendChild(archivedRow(variant, `Вариант ${index + 1}`)));
      group.appendChild(wrapper);
      list.appendChild(group);
    });
  }).catch(() => undefined);
}

function queueMaintenance(): void {
  if (maintenanceQueued) return;
  maintenanceQueued = true;
  requestAnimationFrame(() => {
    maintenanceQueued = false;
    void loadArchive().then(syncUi);
  });
}

function handleCaptureClick(event: MouseEvent): void {
  const button = event.target instanceof Element ? event.target.closest('button') : null;
  if (!(button instanceof HTMLButtonElement)) return;
  const title = button.title;
  if (title !== 'Сделать основным' && title !== 'Основной вариант' && title !== 'Выключить рецепт (убрать из игрового .zs)') return;

  const row = button.parentElement;
  const wrapper = row?.parentElement;
  const group = wrapper?.parentElement;
  if (!(row instanceof HTMLElement) || !(group instanceof HTMLElement)) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void disableActiveVariant(group, row);
}

function isSyntheticArchiveNode(node: Node): boolean {
  return node instanceof Element && (
    node.matches('[data-cubix-archived-only], [data-cubix-archived-variant]') ||
    Boolean(node.closest('[data-cubix-archived-only], [data-cubix-archived-variant]'))
  );
}

export function installCubixCraftActiveVariants(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('click', handleCaptureClick, true);
  document.addEventListener('change', (event) => {
    if (event.target === cloudSelect()) {
      archivePath = '';
      archiveVariants = [];
      queueMaintenance();
    }
  });
  const observer = new MutationObserver((mutations) => {
    const relevant = mutations.some((mutation) => {
      if (mutation.type !== 'childList') return false;
      const changed = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
      return changed.some((node) => !isSyntheticArchiveNode(node));
    });
    if (relevant) queueMaintenance();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  queueMaintenance();
}
