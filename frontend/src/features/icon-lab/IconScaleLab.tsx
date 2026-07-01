import type { CSSProperties, ReactNode } from 'react';
import './IconScaleLab.css';

type IconScaleLabMode = 'direct' | 'absolute' | 'wrapper' | 'scale';

type IconScaleLabVariant = {
  id: string;
  cell: number;
  icon: number;
  mode: IconScaleLabMode;
  label: string;
};

const cellSizes = [24, 28, 32, 36];
const iconSizes = [14, 16, 18, 20];
const modes: Array<{ mode: IconScaleLabMode; label: string }> = [
  { mode: 'direct', label: 'grid place-items' },
  { mode: 'absolute', label: 'absolute center' },
  { mode: 'wrapper', label: 'inner wrapper' },
  { mode: 'scale', label: 'scale 32px base' }
];

const variants: IconScaleLabVariant[] = cellSizes.flatMap((cell) =>
  iconSizes.flatMap((icon) =>
    modes.map(({ mode, label }) => ({
      id: `${cell}-${icon}-${mode}`,
      cell,
      icon,
      mode,
      label
    }))
  )
);

type IconScaleLabProps = {
  sampleRaw: string;
  sampleTitle: string;
  renderSampleIcon: () => ReactNode;
};

export function IconScaleLab({ sampleRaw, sampleTitle, renderSampleIcon }: IconScaleLabProps) {
  return (
    <section className="icon-scale-lab" aria-label="icon-scale-lab">
      <div className="settings-section-title">
        <h3>Лаборатория иконок</h3>
        <span>64 варианта уменьшения и центрирования одной реальной иконки. Выбери номер, который выглядит ровно.</span>
      </div>
      <div className="icon-lab-sample">
        <strong>{sampleTitle}</strong>
        <code>{sampleRaw}</code>
      </div>
      <div className="icon-lab-grid">
        {variants.map((variant, index) => {
          const style = {
            '--lab-cell': `${variant.cell}px`,
            '--lab-icon': `${variant.icon}px`,
            '--lab-scale': `${variant.icon / 32}`
          } as CSSProperties;

          return (
            <article
              key={variant.id}
              className={`icon-lab-card icon-lab-mode-${variant.mode}`}
              aria-label={`icon-lab-variant-${index + 1}`}
            >
              <div className="icon-lab-preview" style={style}>
                <span className="icon-lab-content">
                  {renderSampleIcon()}
                </span>
              </div>
              <div className="icon-lab-meta">
                <strong>#{index + 1}</strong>
                <span>{variant.cell}px / {variant.icon}px</span>
                <code>{variant.label}</code>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
