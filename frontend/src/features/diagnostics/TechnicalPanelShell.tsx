import type { ReactNode } from 'react';

export type DiagnosticsSectionId =
  | 'overview'
  | 'modIcons'
  | 'iconSettings'
  | 'iconLab'
  | 'access'
  | 'caseAliases'
  | 'oreDictPriority'
  | 'modReplacement'
  | 'recipe'
  | 'runtime'
  | 'logs'
  | 'raw';

export type TechnicalPanelSection = {
  id: DiagnosticsSectionId;
  label: string;
  description: string;
  visible: boolean;
};

type TechnicalPanelShellProps = {
  title: string;
  sections: TechnicalPanelSection[];
  activeSection: DiagnosticsSectionId;
  wipeUpdateVisible: boolean;
  wipeUpdateLabel: string;
  wipeUpdateDescription: string;
  children: ReactNode;
  onSelectSection: (section: DiagnosticsSectionId) => void;
  onOpenWipeUpdate: () => void;
};

export function TechnicalPanelShell({
  title,
  sections,
  activeSection,
  wipeUpdateVisible,
  wipeUpdateLabel,
  wipeUpdateDescription,
  children,
  onSelectSection,
  onOpenWipeUpdate
}: TechnicalPanelShellProps) {
  return (
    <div className="debug-shell" aria-label="debug-workspace">
      <aside className="debug-sidebar" aria-label="debug-navigation">
        <strong>{title}</strong>
        {sections.filter((section) => section.visible).map((section) => (
          <button
            key={section.id}
            type="button"
            className={`debug-nav-button ${activeSection === section.id ? 'active' : ''}`.trim()}
            aria-label={`debug-section-${section.id}`}
            onClick={() => onSelectSection(section.id)}
          >
            <span>{section.label}</span>
            <small>{section.description}</small>
          </button>
        ))}
        {wipeUpdateVisible ? (
          <button type="button" className="debug-nav-button debug-nav-action" aria-label={wipeUpdateLabel} onClick={onOpenWipeUpdate}>
            <span>{wipeUpdateLabel}</span>
            <small>{wipeUpdateDescription}</small>
          </button>
        ) : null}
      </aside>
      <section className="debug-content">
        {children}
      </section>
    </div>
  );
}
