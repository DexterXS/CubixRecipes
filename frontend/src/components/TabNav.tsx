import { AppTab } from '../types';

interface TabNavProps {
  value: AppTab;
  onChange: (tab: AppTab) => void;
}

const tabs: Array<{ key: AppTab; label: string }> = [
  { key: 'editor', label: 'Editor' },
  { key: 'preview', label: 'Preview' },
  { key: 'diagnostics', label: 'Diagnostics' },
  { key: 'raw', label: 'Raw' }
];

export function TabNav({ value, onChange }: TabNavProps) {
  return (
    <div className="tab-nav" role="tablist" aria-label="Виды представления">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={value === tab.key}
          className={value === tab.key ? 'tab-button active' : 'tab-button'}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
