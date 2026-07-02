import type { ComponentProps } from 'react';
import { StatusBar } from '../../components/StatusBar';

type StatusItems = ComponentProps<typeof StatusBar>['items'];

type DiagnosticsOverviewPanelProps = {
  status: string;
  statusItems: StatusItems;
  unresolvedCells: number;
  outputIconUrl?: string | null;
  sourcePath?: string | null;
  lastApiStatus: string;
  lastParseResult: string;
  debugActive: boolean;
};

export function DiagnosticsOverviewPanel({
  status,
  statusItems,
  unresolvedCells,
  outputIconUrl,
  sourcePath,
  lastApiStatus,
  lastParseResult,
  debugActive
}: DiagnosticsOverviewPanelProps) {
  return (
    <div className="debug-section-grid">
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Статус</h3>
          <span>{status}</span>
        </div>
        <StatusBar items={statusItems} />
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Диагностика</h3>
          <span>Краткая проверка текущего рецепта.</span>
        </div>
        <ul className="diagnostics-list">
          <li>Unresolved cells: {unresolvedCells}</li>
          <li>Output icon: {outputIconUrl ?? 'not found'}</li>
          <li>Current file: {sourcePath ?? 'unsaved'}</li>
        </ul>
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Быстрый debug</h3>
          <span>Последние ключевые состояния.</span>
        </div>
        <div className="kv-grid">
          <div><span>Последний API</span><strong>{lastApiStatus}</strong></div>
          <div><span>Parse result</span><strong>{lastParseResult}</strong></div>
          <div><span>Иконка output</span><strong>{outputIconUrl ? 'найдена' : 'нет'}</strong></div>
          <div><span>Debug</span><strong>{debugActive ? 'включен' : 'выключен'}</strong></div>
        </div>
      </section>
    </div>
  );
}
