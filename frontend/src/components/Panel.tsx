import { ReactNode } from 'react';

interface PanelProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  collapsible?: boolean;
  collapsed?: boolean;
  collapseLabel?: string;
  expandLabel?: string;
  onToggle?: () => void;
  children?: ReactNode;
  className?: string;
}

export function Panel({
  title,
  subtitle,
  actions,
  collapsible = false,
  collapsed = false,
  collapseLabel = 'Свернуть',
  expandLabel = 'Развернуть',
  onToggle,
  children,
  className = ''
}: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()}>
      <header className="panel-header">
        <div>
          <div className="panel-title-row">
            <h2>{title}</h2>
            {collapsible ? (
              <button type="button" className="ghost-button panel-toggle" onClick={onToggle} aria-expanded={!collapsed}>
                {collapsed ? expandLabel : collapseLabel}
              </button>
            ) : null}
          </div>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </header>
      {!collapsed ? <div className="panel-body">{children}</div> : null}
    </section>
  );
}
