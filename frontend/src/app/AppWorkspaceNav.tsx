import type { WorkspaceNavigationItem, WorkspaceTab } from './workspaceNavigation';

type AppWorkspaceNavProps = {
  tabs: WorkspaceNavigationItem[];
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
};

function setCubixCraftWorkspace(active: boolean) {
  const url = new URL(window.location.href);
  if (active) url.searchParams.set('workspace', 'cubixcraft');
  else url.searchParams.delete('workspace');
  window.history.pushState({}, '', url.toString());
  window.dispatchEvent(new CustomEvent('cubixcraft-workspace-change', { detail: { active } }));
}

export function AppWorkspaceNav({ tabs, activeTab, onSelectTab }: AppWorkspaceNavProps) {
  const cubixCraftActive = new URLSearchParams(window.location.search).get('workspace') === 'cubixcraft';

  const handleSelect = (tab: WorkspaceTab) => {
    if (tab === 'cubixcraft') {
      setCubixCraftWorkspace(true);
      return;
    }
    if (cubixCraftActive) setCubixCraftWorkspace(false);
    onSelectTab(tab);
  };

  return (
    <nav className="main-tabs app-workspace-nav" aria-label="workspace-tabs">
      {tabs.map((tab) => {
        const active = tab.id === 'cubixcraft' ? cubixCraftActive : (!cubixCraftActive && activeTab === tab.id);
        return (
          <button
            key={tab.id}
            type="button"
            data-testid={`workspace-tab-${tab.id}`}
            aria-label={tab.label}
            className={`main-tab-button app-workspace-nav-button area-${tab.area} ${active ? 'active' : ''}`.trim()}
            onClick={() => handleSelect(tab.id)}
          >
            <span className="app-workspace-nav-label">{tab.label}</span>
            <span className="app-workspace-nav-description">{tab.description}</span>
          </button>
        );
      })}
    </nav>
  );
}
