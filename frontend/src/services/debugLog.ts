export interface FrontendLogPayload {
  source?: string;
  level?: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';
  category: string;
  message: string;
  details?: Record<string, unknown>;
  verbose_only?: boolean;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function logFrontendEvent(payload: FrontendLogPayload): void {
  void fetch('/api/debug/log', {
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
    // debug logging must never break the app flow
  });
}

export function installConsoleCapture(): void {
  (window as Window & { __cubixrecipesDebugCollector?: boolean }).__cubixrecipesDebugCollector = true;
  logFrontendEvent({ level: 'INFO', category: 'FRONTEND', message: 'Frontend debug collector initialized', details: { location: window.location.href } });
  const methods: Array<'log' | 'warn' | 'error'> = ['log', 'warn', 'error'];
  methods.forEach((method) => {
    const original = console[method].bind(console);
    console[method] = (...args: unknown[]) => {
      logFrontendEvent({
        level: method === 'error' ? 'ERROR' : method === 'warn' ? 'WARN' : 'INFO',
        category: 'FRONTEND',
        message: `console.${method}`,
        details: { args: args.map((item) => safeStringify(item)) },
        verbose_only: method === 'log'
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
