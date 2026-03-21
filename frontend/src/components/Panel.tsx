import { CSSProperties, ReactNode } from 'react';

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
  style?: CSSProperties;
  dragHandle?: ReactNode;
  footer?: ReactNode;
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
  className = '',
  style,
  dragHandle,
  footer
}: PanelProps) {
  return (
    <section className={`panel ${className}`.trim()} style={style}>
      <header className="panel-header">
        <div className="panel-header-main">
          <div className="panel-title-row">
            {dragHandle ? <div className="panel-drag-slot">{dragHandle}</div> : null}
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
      {!collapsed && footer ? <div className="panel-footer">{footer}</div> : null}
    </section>
  );
}
