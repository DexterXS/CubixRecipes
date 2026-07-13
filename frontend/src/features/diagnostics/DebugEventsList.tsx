export type DebugEventLevel = 'info' | 'success' | 'warning' | 'error';

export type DebugEventCategory = 'hotkeys' | 'ui' | 'recipe' | 'api' | 'storage';

export type DebugEventDetails = Record<string, string | number | boolean | null | undefined>;

export type DebugEventItem = {
  id: number;
  timestamp: string;
  level: DebugEventLevel;
  category: DebugEventCategory;
  message: string;
  details?: DebugEventDetails;
};

type DebugEventsListProps = {
  events: DebugEventItem[];
  categoryLabels: Record<DebugEventCategory, string>;
  emptyMessage: string;
};

export function DebugEventsList({ events, categoryLabels, emptyMessage }: DebugEventsListProps) {
  if (!events.length) {
    return <div className="inline-hint">{emptyMessage}</div>;
  }

  return (
    <ol className="debug-log-list">
      {events.map((entry) => (
        <li key={entry.id} className={`debug-log-event debug-log-${entry.level}`}>
          <div className="debug-log-event-head">
            <span>{entry.timestamp}</span>
            <strong>{entry.message}</strong>
            <em>{categoryLabels[entry.category]}</em>
            <code>{entry.level}</code>
          </div>
          {entry.details ? (
            <dl>
              {Object.entries(entry.details).map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{String(value)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
