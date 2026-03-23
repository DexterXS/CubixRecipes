import { apiPath } from '../config/runtime';

export interface FrontendLogPayload {
  source?: string;
  level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  category: string;
  message: string;
  details?: Record<string, unknown>;
  verbose_only?: boolean;
}

const recentEvents = new Map<string, number>();
const DEDUP_WINDOW_MS = 1500;
const DEBUG_ENDPOINT_MUTE_MS = 10000;
const DEBUG_RETRY_DELAYS_MS = [600, 1400, 2600];
let debugEndpointMutedUntil = 0;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function shouldSkip(payload: FrontendLogPayload): boolean {
  const key = `${payload.source ?? 'FRONTEND'}|${payload.level ?? 'INFO'}|${payload.category}|${payload.message}|${safeStringify(payload.details ?? {})}`;
  const now = Date.now();
  const previous = recentEvents.get(key);
  recentEvents.set(key, now);
  if (previous && now - previous < DEDUP_WINDOW_MS) {
    return true;
  }
  if (recentEvents.size > 200) {
    const threshold = now - DEDUP_WINDOW_MS;
    for (const [entryKey, entryTime] of recentEvents.entries()) {
      if (entryTime < threshold) {
        recentEvents.delete(entryKey);
      }
    }
  }
  return false;
}

function sendFrontendLog(payload: FrontendLogPayload, attempt: number): void {
  void fetch(apiPath('/debug/log'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: payload.source ?? 'FRONTEND',
      level: payload.level ?? 'INFO',
      category: payload.category,
      message: payload.message,
      details: payload.details ?? {},
      verbose_only: payload.verbose_only ?? false
    })
  }).catch(() => {
    if (attempt < DEBUG_RETRY_DELAYS_MS.length) {
      window.setTimeout(() => sendFrontendLog(payload, attempt + 1), DEBUG_RETRY_DELAYS_MS[attempt]);
      return;
    }
    debugEndpointMutedUntil = Date.now() + DEBUG_ENDPOINT_MUTE_MS;
    // debug logging must never break the app flow
  });
}

export function logFrontendEvent(payload: FrontendLogPayload): void {
  if (shouldSkip(payload) || debugEndpointMutedUntil > Date.now()) {
    return;
  }
  sendFrontendLog(payload, 0);
}

export function installConsoleCapture(): void {
  const state = window as Window & { __cubixrecipesDebugCollector?: boolean };
  if (state.__cubixrecipesDebugCollector) {
    return;
  }
  state.__cubixrecipesDebugCollector = true;
  logFrontendEvent({ level: 'INFO', category: 'FRONTEND', message: 'Frontend debug collector initialized', details: { location: window.location.href } });

  const methods: Array<'warn' | 'error'> = ['warn', 'error'];
  methods.forEach((method) => {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      logFrontendEvent({
        level: method === 'error' ? 'ERROR' : 'WARN',
        category: 'FRONTEND',
        message: `console.${method}`,
        details: { args: args.map((item) => safeStringify(item)).slice(0, 5) },
        verbose_only: false
      });
      original(...args);
    };
  });

  window.addEventListener('error', (event) => {
    logFrontendEvent({
      level: 'ERROR',
      category: 'FRONTEND',
      message: 'Unhandled window error',
      details: { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno }
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    logFrontendEvent({
      level: 'ERROR',
      category: 'FRONTEND',
      message: 'Unhandled promise rejection',
      details: { reason: safeStringify(event.reason) }
    });
  });
}
