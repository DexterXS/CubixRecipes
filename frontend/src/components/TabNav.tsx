import { AppTab } from '../types';

interface TabNavProps {
  labels: Record<AppTab, string>;
  value: AppTab;
  onChange: (tab: AppTab) => void;
}

export function TabNav({ labels, value, onChange }: TabNavProps) {
  const tabs = Object.entries(labels) as Array<[AppTab, string]>;
  return (
    <div className="tab-nav" role="tablist" aria-label="Виды представления">
      {tabs.map(([key, label]) => (
        <button
          key={key}
          type="button"
          role="tab"
          aria-selected={value === key}
          className={value === key ? 'tab-button active' : 'tab-button'}
          onClick={() => onChange(key)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
