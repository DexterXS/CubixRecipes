import { Panel } from '../../components/Panel';
import type { AuctionCommandStages } from './auctionCommands';
import type { AuctionCommandStage, AuctionWorkflowMode } from './auctionTypes';

type AuctionCommandPreviewProps = {
  workflowMode: AuctionWorkflowMode;
  commandStage: AuctionCommandStage;
  commandStages: AuctionCommandStages;
  commands: string;
  onCommandStageChange: (stage: AuctionCommandStage) => void;
};

export function AuctionCommandPreview({
  workflowMode,
  commandStage,
  commandStages: _commandStages,
  commands,
  onCommandStageChange
}: AuctionCommandPreviewProps) {
  return (
    <Panel
      title="Предпросмотр файла"
      subtitle="Файл скачивается без расширения"
    >
      <div className="auction-step-tabs" aria-label="auction-command-stage">
        {workflowMode === 'install' ? (
          <button type="button" className={commandStage === 'create' ? 'active' : ''} onClick={() => onCommandStageChange('create')}>1. Создать слоты</button>
        ) : null}
        <button type="button" className={commandStage === 'ids' ? 'active' : ''} onClick={() => onCommandStageChange('ids')}>2. Выписать ID</button>
        <button type="button" className={commandStage === 'items' ? 'active' : ''} onClick={() => onCommandStageChange('items')}>3. Закинуть предметы</button>
        <button type="button" className={commandStage === 'settings' ? 'active' : ''} onClick={() => onCommandStageChange('settings')}>4. Настроить и запустить</button>
      </div>
      <pre className="raw-block auction-command-preview">{commands || 'Команды появятся после настройки аукциона.'}</pre>
    </Panel>
  );
}
