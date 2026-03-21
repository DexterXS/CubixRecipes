interface StatusItem {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning';
}

export function StatusBar({ items }: { items: StatusItem[] }) {
  return (
    <div className="status-bar" role="status" aria-live="polite">
      {items.map((item) => (
        <div key={item.label} className={`status-pill ${item.tone ?? 'default'}`}>
          <span>{item.label}:</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
