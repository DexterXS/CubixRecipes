import type { CSSProperties, ReactNode } from 'react';
import type { IconSurfaceId } from './iconSurfaces';
import { useIconSurfaceSettings } from './IconSurfaceSettingsContext';

type Props = {
  surfaceId: IconSurfaceId;
  children: ReactNode;
  className?: string;
  title?: string;
  placement?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  size?: 'default' | 'compact';
};

function cssSurfaceKey(surfaceId: IconSurfaceId): string {
  return surfaceId.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function IconSurfaceSettingsHost({ surfaceId, children, className, title, placement = 'top-right', size = 'default' }: Props) {
  const settings = useIconSurfaceSettings();
  const prefix = `--icon-${cssSurfaceKey(surfaceId)}`;
  const style = {
    '--icon-surface-padding': `var(${prefix}-padding, 0px)`,
    '--icon-surface-border-width': `var(${prefix}-border-width, 0px)`,
    '--icon-surface-overflow': `var(${prefix}-overflow, visible)`,
    '--icon-surface-smoothing': `var(${prefix}-smoothing, pixelated)`,
    '--icon-surface-gap-x': `var(${prefix}-gap-x, var(${prefix}-gap, 0px))`,
    '--icon-surface-gap-y': `var(${prefix}-gap-y, var(${prefix}-gap, 0px))`,
    '--icon-surface-group-row-gap': `var(${prefix}-group-row-gap, 0px)`,
    '--icon-surface-group-column-gap': `var(${prefix}-group-column-gap, 0px)`
  } as CSSProperties;

  return (
    <div className={`icon-settings-surface icon-settings-placement-${placement} ${size === 'compact' ? 'icon-settings-compact' : ''} ${className ?? ''}`.trim()} data-icon-surface={surfaceId} style={style}>
      {settings.canEdit ? (
        <button
          type="button"
          className="icon-settings-trigger"
          aria-label={title ?? `Настроить иконки: ${surfaceId}`}
          aria-expanded={settings.activeSurfaceId === surfaceId}
          title="Настроить иконки этой области"
          onClick={(event) => settings.openSurface(surfaceId, event.currentTarget)}
        >
          ⚙
        </button>
      ) : null}
      {children}
    </div>
  );
}
