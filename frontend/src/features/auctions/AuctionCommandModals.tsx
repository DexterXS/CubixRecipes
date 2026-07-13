import type { AuctionCommandStages } from './auctionCommands';
import { AuctionCommandGeneratorModal } from './AuctionCommandGeneratorModal';
import { AuctionDownloadModal, downloadTextWithoutExtension } from './AuctionDownloadModal';
import type { AuctionCommandProfile, AuctionWorkflowMode } from './auctionTypes';

type AuctionCommandModalsProps = {
  downloadOpen: boolean;
  generatorOpen: boolean;
  filenameDraft: string;
  commands: string;
  commandProfile: AuctionCommandProfile;
  commandStagesByMode: Record<AuctionWorkflowMode, AuctionCommandStages>;
  onFilenameChange: (value: string) => void;
  onSaveProfile: (profile: AuctionCommandProfile) => void;
  onCloseDownload: () => void;
  onCloseGenerator: () => void;
};

export function AuctionCommandModals({
  downloadOpen,
  generatorOpen,
  filenameDraft,
  commands,
  commandProfile,
  commandStagesByMode,
  onFilenameChange,
  onSaveProfile,
  onCloseDownload,
  onCloseGenerator
}: AuctionCommandModalsProps) {
  return (
    <>
      {downloadOpen ? (
        <AuctionDownloadModal
          filenameDraft={filenameDraft}
          commands={commands}
          onFilenameChange={onFilenameChange}
          onClose={onCloseDownload}
        />
      ) : null}

      {generatorOpen ? (
        <AuctionCommandGeneratorModal
          filenameDraft={filenameDraft}
          profile={commandProfile}
          stagesByMode={commandStagesByMode}
          onFilenameChange={onFilenameChange}
          onSave={onSaveProfile}
          onDownload={(nextCommands) => downloadTextWithoutExtension(filenameDraft, nextCommands)}
          onClose={onCloseGenerator}
        />
      ) : null}
    </>
  );
}
