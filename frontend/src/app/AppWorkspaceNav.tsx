import type { WorkspaceNavigationItem, WorkspaceTab } from './workspaceNavigation';

type AppWorkspaceNavProps = {
  tabs: WorkspaceNavigationItem[];
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
};

export function AppWorkspaceNav({ tabs, activeTab, onSelectTab }: AppWorkspaceNavProps) {
  const handleSelect = (tab: WorkspaceTab) => {
    if (tab === 'cubixcraft') {
      const url = new URL(window.location.href);
      url.searchParams.set('workspace', 'cubixcraft');
      window.location.assign(url.toString());
      return;
    }
    onSelectTab(tab);
  };

  return (
    <nav className="main-tabs app-workspace-nav" aria-label="workspace-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          data-testid={`workspace-tab-${tab.id}`}
          aria-label={tab.label}
          className={`main-tab-button app-workspace-nav-button area-${tab.area} ${activeTab === tab.id ? 'active' : ''}`.trim()}
          onClick={() => handleSelect(tab.id)}
        >
          <span className="app-workspace-nav-label">{tab.label}</span>
          <span className="app-workspace-nav-description">{tab.description}</span>
        </button>
      ))}
    </nav>
  );
}
