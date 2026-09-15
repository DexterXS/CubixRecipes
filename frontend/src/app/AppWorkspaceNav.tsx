import type { ReactNode } from 'react';

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

function WorkspaceTabIcon({ tab }: { tab: WorkspaceTab }) {
  const icon = (children: ReactNode) => (
    <svg className="app-workspace-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );

  switch (tab) {
    case 'editor':
      return icon(<><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>);
    case 'cubixcraft':
      return icon(<><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>);
    case 'itemdb':
      return icon(<><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4.5 4.5M8 10.5h5M10.5 8v5" /></>);
    case 'recipe':
      return icon(<><path d="M7 3h8l3 3v15H7z" /><path d="M15 3v4h4M10 12h5M10 16h5" /><path d="M4 7v14h3" /></>);
    case 'auctions':
      return icon(<><path d="m14 4 6 6M12 6l6 6M4 20l8-8M3 21h8" /><path d="m6 7 4-4 7 7-4 4z" /></>);
    case 'tasks':
      return icon(<><rect x="5" y="4" width="14" height="17" rx="2" /><path d="m8 9 1.5 1.5L12 8M14 10h2M8 15l1.5 1.5L12 14M14 16h2" /></>);
    case 'cloud':
      return icon(<><path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 8.5 4.5 4.5 0 0 0 7 18Z" /><path d="M12 11v6M9.5 13.5 12 11l2.5 2.5" /></>);
    case 'technical':
      return icon(<><path d="m14.5 5.5 4-2 .8 3.2-2.2 2.2M13 7 5 15l4 4 8-8M4 20l3-3" /><path d="m14 14 5 5" /></>);
  }
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
            aria-describedby={`workspace-tab-details-${tab.id}`}
          >
            <WorkspaceTabIcon tab={tab.id} />
            <span className="app-workspace-nav-label">{tab.label}</span>
            <span className="app-workspace-nav-tooltip" role="tooltip" id={`workspace-tab-details-${tab.id}`}>
              <span className="app-workspace-nav-tooltip-title">{tab.label}</span>
              <span className="app-workspace-nav-tooltip-description">{tab.details}</span>
              <span className="app-workspace-nav-tooltip-hint">{tab.hint}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
