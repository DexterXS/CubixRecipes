import { DebugEventsList, type DebugEventCategory, type DebugEventItem, type DebugEventLevel } from './DebugEventsList';

type DiagnosticsLogsPanelProps = {
  events: DebugEventItem[];
  categoryLabels: Record<DebugEventCategory, string>;
  levelLabels: Record<DebugEventLevel, string>;
  categoryFilters: Record<DebugEventCategory, boolean>;
  levelFilters: Record<DebugEventLevel, boolean>;
  debugActive: boolean;
  onCategoryFilterChange: (category: DebugEventCategory, enabled: boolean) => void;
  onLevelFilterChange: (level: DebugEventLevel, enabled: boolean) => void;
};

export function DiagnosticsLogsPanel({
  events,
  categoryLabels,
  levelLabels,
  categoryFilters,
  levelFilters,
  debugActive,
  onCategoryFilterChange,
  onLevelFilterChange
}: DiagnosticsLogsPanelProps) {
  return (
    <div className="debug-section-grid">
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Фильтры вывода</h3>
          <span>Эти же настройки доступны в модальном окне настроек.</span>
        </div>
        <div className="debug-filter-grid">
          {Object.entries(categoryLabels).map(([category, label]) => (
            <label key={category} className="view-toggle">
              <input
                type="checkbox"
                checked={categoryFilters[category as DebugEventCategory]}
                onChange={(event) => onCategoryFilterChange(category as DebugEventCategory, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <div className="debug-filter-grid">
          {Object.entries(levelLabels).map(([level, label]) => (
            <label key={level} className="view-toggle">
              <input
                type="checkbox"
                checked={levelFilters[level as DebugEventLevel]}
                onChange={(event) => onLevelFilterChange(level as DebugEventLevel, event.target.checked)}
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Лента событий</h3>
          <span>{debugActive ? `Событий: ${events.length}` : 'Debug выключен в настройках.'}</span>
        </div>
        <DebugEventsList
          events={events}
          categoryLabels={categoryLabels}
          emptyMessage="Debug включен, но событий пока нет. Выполни действие в интерфейсе, чтобы оно появилось здесь."
        />
      </section>
    </div>
  );
}
