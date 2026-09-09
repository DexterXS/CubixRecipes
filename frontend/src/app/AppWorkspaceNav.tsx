import type { WorkspaceNavigationItem, WorkspaceTab } from './workspaceNavigation';

type AppWorkspaceNavProps = {
  tabs: WorkspaceNavigationItem[];
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
};

function currentSpecialWorkspace(): 'cubixcraft' | 'itemdb' | null {
  const value = new URLSearchParams(window.location.search).get('workspace');
  return value === 'cubixcraft' || value === 'itemdb' ? value : null;
}

function setSpecialWorkspace(workspace: 'cubixcraft' | 'itemdb' | null) {
  const url = new URL(window.location.href);
  if (workspace) url.searchParams.set('workspace', workspace);
  else url.searchParams.delete('workspace');
  window.history.pushState({}, '', url.toString());
  window.dispatchEvent(new CustomEvent('app-workspace-change', { detail: { workspace } }));
  window.dispatchEvent(new CustomEvent('cubixcraft-workspace-change', { detail: { active: workspace === 'cubixcraft' } }));
}

export function AppWorkspaceNav({ tabs, activeTab, onSelectTab }: AppWorkspaceNavProps) {
  const specialWorkspace = currentSpecialWorkspace();

  const handleSelect = (tab: WorkspaceTab) => {
    if (tab === 'cubixcraft' || tab === 'itemdb') {
      setSpecialWorkspace(tab);
      return;
    }
    if (specialWorkspace) setSpecialWorkspace(null);
    onSelectTab(tab);
  };

  return (
    <nav className="main-tabs app-workspace-nav" aria-label="workspace-tabs">
      {tabs.map((tab) => {
        const active = tab.id === 'cubixcraft' || tab.id === 'itemdb'
          ? specialWorkspace === tab.id
          : (!specialWorkspace && activeTab === tab.id);
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
