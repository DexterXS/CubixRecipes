import type { ReactNode } from 'react';

type DiagnosticsRecipePanelProps = {
  recipeType: string;
  bindingMode: string;
  summary: string;
  filledCells: number;
  nullCells: number;
  unresolvedCells: number;
  outputRaw: string;
  outputDisplayName?: string | null;
  outputIcon: ReactNode;
  outputIconFound: boolean;
};

export function DiagnosticsRecipePanel({
  recipeType,
  bindingMode,
  summary,
  filledCells,
  nullCells,
  unresolvedCells,
  outputRaw,
  outputDisplayName,
  outputIcon,
  outputIconFound
}: DiagnosticsRecipePanelProps) {
  return (
    <div className="debug-section-grid">
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Рецепт</h3>
          <span>Состояние текущей сетки и результата.</span>
        </div>
        <div className="kv-grid">
          <div><span>Тип</span><strong>{recipeType}</strong></div>
          <div><span>Позиция</span><strong>{bindingMode}</strong></div>
          <div><span>Размер</span><strong>{summary}</strong></div>
          <div><span>Заполнено</span><strong>{filledCells}</strong></div>
          <div><span>Пусто</span><strong>{nullCells}</strong></div>
          <div><span>Проблемных ячеек</span><strong>{unresolvedCells}</strong></div>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Output</h3>
          <span>{outputDisplayName ?? outputRaw}</span>
        </div>
        <div className="recipe-uses-output">
          <span className="output-icon-slot">{outputIcon}</span>
          <div>
            <strong>{outputRaw}</strong>
            <span>{outputIconFound ? 'Иконка найдена' : 'Иконка не найдена'}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
