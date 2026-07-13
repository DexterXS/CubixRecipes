import { Panel } from '../../components/Panel';
import type { ModIconAdminStatus, ModIconAtlasManifest } from '../../types';
import { formatFileSize } from '../../utils/formatFileSize';

type DiagnosticsModIconsPanelProps = {
  status: ModIconAdminStatus | null;
  manifest: ModIconAtlasManifest | null;
  message: string;
  uploading: boolean;
  generating: boolean;
  archiveAction: string;
  normalizeImageUrl: (imageUrl: string) => string;
  onArchiveFiles: (files: FileList | File[]) => void;
  onRefreshStatus: () => void;
  onGenerateAtlases: () => void;
  onDownloadArchive: (filename: string) => void;
  onCleanArchive: (filename: string) => void;
  onDeleteArchive: (filename: string) => void;
};

export function DiagnosticsModIconsPanel({
  status,
  manifest,
  message,
  uploading,
  generating,
  archiveAction,
  normalizeImageUrl,
  onArchiveFiles,
  onRefreshStatus,
  onGenerateAtlases,
  onDownloadArchive,
  onCleanArchive,
  onDeleteArchive
}: DiagnosticsModIconsPanelProps) {
  const activeManifest = status?.manifest ?? manifest;
  const atlasEntries = activeManifest ? [...Object.values(activeManifest.entries.x32), ...Object.values(activeManifest.entries.x256)] : [];

  return (
    <div className="workspace-layout workspace-layout-admin">
      <div className="workspace-column workspace-left">
        <div className="workspace-panel-shell panel-admin-mod-icons">
          <Panel title="Атласы" subtitle="ZIP архивы формата modid_x32.zip или modid_x256.zip с PNG внутри">
            <label
              className="file-drop-zone"
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                onArchiveFiles(event.dataTransfer.files);
              }}
            >
              <input
                type="file"
                accept=".zip,application/zip"
                onChange={(event) => {
                  if (event.target.files) {
                    onArchiveFiles(event.target.files);
                    event.currentTarget.value = '';
                  }
                }}
              />
              <strong>Загрузить ZIP архив иконок</strong>
              <span>Например: energyadditions_x32.zip с папкой energyadditions_x32/ и PNG-файлами внутри</span>
            </label>
            <div className="file-actions">
              <button type="button" disabled={uploading || Boolean(archiveAction)} onClick={onRefreshStatus}>Обновить статус</button>
              <button type="button" className="secondary-button" disabled={generating || Boolean(archiveAction) || !(status?.archives.length)} onClick={onGenerateAtlases}>Сгенерировать атласы</button>
            </div>
            {message ? <div className="inline-status inline-status-default">{message}</div> : null}
            <div className="admin-file-list">
              {(status?.archives ?? []).map((archive) => (
                <div key={archive.name} className="admin-file-row">
                  <div>
                    <strong>{archive.name}</strong>
                    <span>{formatFileSize(archive.size)}</span>
                  </div>
                  <div className="admin-file-actions">
                    <span>{archive.modifiedAt ? new Date(archive.modifiedAt).toLocaleString() : '-'}</span>
                    <div className="inline-actions">
                      <button type="button" className="ghost-button" onClick={() => onDownloadArchive(archive.name)}>Скачать</button>
                      <button type="button" className="secondary-button" disabled={Boolean(archiveAction)} onClick={() => onCleanArchive(archive.name)}>
                        {archiveAction === `clean:${archive.name}` ? 'Очистка...' : 'Очистить лишнее'}
                      </button>
                      <button type="button" className="ghost-button danger-lite-button" disabled={Boolean(archiveAction)} onClick={() => onDeleteArchive(archive.name)}>
                        {archiveAction === `delete:${archive.name}` ? 'Удаление...' : 'Удалить'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {status && !status.archives.length ? <div className="inline-hint inline-hint-warning">Архивы ещё не загружены.</div> : null}
            </div>
          </Panel>
        </div>
      </div>
      <div className="workspace-column workspace-right">
        <div className="workspace-panel-shell panel-admin-mod-atlases">
          <Panel title="Атласы" subtitle="4096x4096 максимум, дополнительные страницы создаются автоматически">
            <div className="kv-grid">
              <div><span>Модов</span><strong>{activeManifest?.totalMods ?? 0}</strong></div>
              <div><span>Иконок</span><strong>{activeManifest?.totalIcons ?? atlasEntries.length}</strong></div>
              <div><span>Атласов</span><strong>{activeManifest?.atlases.length ?? 0}</strong></div>
              <div><span>Fallback</span><strong>itempanel atlas</strong></div>
            </div>
            {activeManifest?.rejected.length ? (
              <div className="inline-status inline-status-warning">Отклонено иконок: {activeManifest.rejected.length}</div>
            ) : null}
            <div className="mod-icon-preview-grid">
              {atlasEntries.map((entry) => {
                const atlas = activeManifest?.atlases.find((item) => item.file === entry.atlasFile);
                const previewScale = 40 / entry.w;
                return (
                  <span
                    key={`${entry.size}-${entry.key ?? entry.modid}-${entry.x}-${entry.y}`}
                    className="mod-icon-preview"
                    title={`${entry.modid}: ${entry.iconName ?? entry.modid} x${entry.size}`}
                    style={{
                      backgroundImage: `url(${normalizeImageUrl(entry.image_url)})`,
                      backgroundPosition: `-${entry.x * previewScale}px -${entry.y * previewScale}px`,
                      backgroundSize: `${(atlas?.columns ?? 1) * entry.w * previewScale}px ${(atlas?.rows ?? 1) * entry.h * previewScale}px`
                    }}
                    aria-label={`mod-icon-${entry.key ?? entry.modid}-x${entry.size}`}
                  />
                );
              })}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
