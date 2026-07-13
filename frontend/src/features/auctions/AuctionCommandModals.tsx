import { AuctionCommandGeneratorModal } from './AuctionCommandGeneratorModal';
import { AuctionDownloadModal, downloadTextWithoutExtension } from './AuctionDownloadModal';
import type { AuctionCommandProfile, AuctionCurve, AuctionDraft, AuctionItemIdMode } from './auctionTypes';

type AuctionCommandGeneratorContext = {
  auctions: AuctionDraft[];
  curve: AuctionCurve;
  idMode: AuctionItemIdMode;
  timezoneOffsetMinutes: number;
  graphStartLocal: string;
};

type AuctionCommandModalsProps = {
  downloadOpen: boolean;
  generatorOpen: boolean;
  filenameDraft: string;
  commands: string;
  commandProfile: AuctionCommandProfile;
  commandContext: AuctionCommandGeneratorContext;
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
  commandContext,
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
          {...commandContext}
          onFilenameChange={onFilenameChange}
          onSave={onSaveProfile}
          onDownload={(nextCommands) => downloadTextWithoutExtension(filenameDraft, nextCommands)}
          onClose={onCloseGenerator}
        />
      ) : null}
    </>
  );
}
