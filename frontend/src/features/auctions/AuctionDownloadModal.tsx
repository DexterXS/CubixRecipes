import { sanitizeAuctionFilename } from './auctionCommands';

type AuctionDownloadModalProps = {
  filenameDraft: string;
  commands: string;
  onFilenameChange: (value: string) => void;
  onClose: () => void;
};

export function downloadTextWithoutExtension(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = sanitizeAuctionFilename(filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function AuctionDownloadModal({ filenameDraft, commands, onFilenameChange, onClose }: AuctionDownloadModalProps) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="modal cloud-save-modal"
        role="dialog"
        aria-modal="true"
        aria-label="auction-download-file"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          downloadTextWithoutExtension(filenameDraft, commands);
          onClose();
        }}
      >
        <div className="modal-header">
          <div>
            <h2>Скачать файл команд</h2>
            <span className="modal-subtitle">Расширение не добавляется: итоговый файл будет без .txt.</span>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>Закрыть</button>
        </div>
        <div className="settings-modal-body">
          <label className="field-block">
            <span>Имя файла</span>
            <input autoFocus value={filenameDraft} onChange={(event) => onFilenameChange(event.target.value)} />
          </label>
          <div className="cloud-save-preview"><span>Итог</span><strong>{sanitizeAuctionFilename(filenameDraft)}</strong></div>
          <div className="inline-actions cloud-save-actions">
            <button type="button" className="ghost-button" onClick={onClose}>Отмена</button>
            <button type="submit" disabled={!commands.trim()}>Скачать</button>
          </div>
        </div>
      </form>
    </div>
  );
}
