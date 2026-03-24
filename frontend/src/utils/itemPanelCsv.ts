export type ItemPanelTranslations = {
  byKey: Map<string, string>;
};

const SUPPORTED_DELIMITERS = [',', ';', '\t'] as const;

function decodeItemPanelBytes(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1251').decode(bytes);
  }
}

function normalizeValue(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/\\n/g, '')
    .trim();
}

function detectDelimiter(sampleLine: string): string {
  const normalized = sampleLine.replace(/^\uFEFF/, '');
  const ranked = SUPPORTED_DELIMITERS
    .map((delimiter) => ({
      delimiter,
      count: normalized.split(delimiter).length - 1
    }))
    .sort((a, b) => b.count - a.count);
  return ranked[0]?.count > 0 ? ranked[0].delimiter : ',';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      result.push(current);
      current = '';
      continue;
    }
    current += char;
  }

  result.push(current);
  return result;
}

export function parseItemPanelCsvText(text: string): ItemPanelTranslations {
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { byKey: new Map() };
  }

  const delimiter = detectDelimiter(lines[0]);
  const dataLines = lines.slice(1);
  const byKey = new Map<string, string>();

  dataLines.forEach((line) => {
    const parts = splitCsvLine(line, delimiter);
    if (parts.length < 5) {
      return;
    }

    const key = normalizeValue(parts[0]).toLowerCase();
    const display = normalizeValue(parts[4]);
    if (!key || !display || display === '-' || display === '- ') {
      return;
    }
    byKey.set(key, display);
  });

  return { byKey };
}

export function parseItemPanelCsvBuffer(bytes: ArrayBuffer): ItemPanelTranslations {
  const text = decodeItemPanelBytes(bytes);
  return parseItemPanelCsvText(text);
}
