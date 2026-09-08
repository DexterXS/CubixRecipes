import type { WorkspaceNavigationItem, WorkspaceTab } from './workspaceNavigation';

type AppWorkspaceNavProps = {
  tabs: WorkspaceNavigationItem[];
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
};

export function AppWorkspaceNav({ tabs, activeTab, onSelectTab }: AppWorkspaceNavProps) {
  return (
    <nav className="main-tabs app-workspace-nav" aria-label="workspace-tabs">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          data-testid={`workspace-tab-${tab.id}`}
          aria-label={tab.label}
          className={`main-tab-button app-workspace-nav-button area-${tab.area} ${activeTab === tab.id ? 'active' : ''}`.trim()}
          onClick={() => onSelectTab(tab.id)}
        >
          <span className="app-workspace-nav-label">{tab.label}</span>
          <span className="app-workspace-nav-description">{tab.description}</span>
        </button>
      ))}
      <a
        href={`${window.location.pathname}?workspace=cubixcraft`}
        data-testid="workspace-tab-cubixcraft"
        aria-label="CubixCraft"
        className="main-tab-button app-workspace-nav-button area-recipes"
      >
        <span className="app-workspace-nav-label">CubixCraft</span>
        <span className="app-workspace-nav-description">9×9 · большие количества</span>
      </a>
    </nav>
  );
}
