const ITEM_RAW_PATTERN = /^<([a-zA-Z0-9_.-]+:[a-zA-Z0-9_./-]+)(?::([0-9*]+))?>(?:\.withTag\(([\s\S]*)\))?$/;

const MUTABLE_ENERGY_KEYS = new Set([
  'charge',
  'currentenergy',
  'currentpower',
  'energy',
  'euenergy',
  'energystored',
  'energystoredrf',
  'internalmaxpower',
  'internalcurrentpower',
  'powerstored',
  'rfenergy',
  'storedenergy',
  'storedenergyrf'
]);

export function normalizeRecipeIngredientRaw(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(ITEM_RAW_PATTERN);
  if (!match || !match[3] || !hasMutableEnergyKey(match[3])) {
    return trimmed;
  }
  return `<${match[1]}:*>`;
}

function hasMutableEnergyKey(nbtRaw: string): boolean {
  return splitTopLevelFields(nbtRaw).some((field) => {
    const separator = findTopLevelSeparator(field, ':');
    if (separator < 0) return false;
    const key = field.slice(0, separator).trim().replace(/^['"]|['"]$/g, '').toLowerCase();
    return MUTABLE_ENERGY_KEYS.has(key);
  });
}

function splitTopLevelFields(nbtRaw: string): string[] {
  const trimmed = nbtRaw.trim();
  const body = trimmed.startsWith('{') && trimmed.endsWith('}')
    ? trimmed.slice(1, -1)
    : trimmed;
  const fields: string[] = [];
  let start = 0;
  let curlyDepth = 0;
  let squareDepth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') curlyDepth += 1;
    if (char === '}') curlyDepth -= 1;
    if (char === '[') squareDepth += 1;
    if (char === ']') squareDepth -= 1;
    if (char === ',' && curlyDepth === 0 && squareDepth === 0) {
      fields.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  const lastField = body.slice(start).trim();
  if (lastField) fields.push(lastField);
  return fields;
}

function findTopLevelSeparator(source: string, separator: string): number {
  let curlyDepth = 0;
  let squareDepth = 0;
  let quote: string | null = null;
  let escaped = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{') curlyDepth += 1;
    if (char === '}') curlyDepth -= 1;
    if (char === '[') squareDepth += 1;
    if (char === ']') squareDepth -= 1;
    if (char === separator && curlyDepth === 0 && squareDepth === 0) return index;
  }
  return -1;
}
