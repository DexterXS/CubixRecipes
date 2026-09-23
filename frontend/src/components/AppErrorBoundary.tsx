import { Component, type ErrorInfo, type ReactNode } from 'react';
import { logFrontendEvent } from '../services/debugLog';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logFrontendEvent({
      level: 'ERROR',
      category: 'FRONTEND_CRASH',
      message: 'React render crashed',
      details: {
        message: error.message,
        stack: error.stack ?? '',
        componentStack: info.componentStack ?? ''
      }
    });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, background: '#0b1220', color: '#e5eefc', fontFamily: 'Inter, Arial, sans-serif' }}>
        <section style={{ width: 'min(680px, 100%)', padding: 22, border: '1px solid #2f3b53', borderRadius: 12, background: '#121c2d' }}>
          <h1 style={{ marginTop: 0 }}>CubixRecipes: ошибка интерфейса</h1>
          <p>Страница не будет оставаться чёрной. Ошибка отправлена в журнал.</p>
          <code style={{ display: 'block', overflowWrap: 'anywhere', marginBottom: 16 }}>{this.state.error.message}</code>
          <button type="button" onClick={() => window.location.reload()}>Перезагрузить</button>
        </section>
      </main>
    );
  }
}
