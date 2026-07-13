import { useMemo, useState } from 'react';
import { sanitizeAuctionFilename } from './auctionCommands';
import {
  auctionCommandBlockLabels,
  buildAuctionCommandsFromProfile,
  normalizeAuctionCommandProfile
} from './auctionCommandProfile';
import type { AuctionCommandStages } from './auctionCommands';
import type { AuctionCommandProfile, AuctionCommandProfileEntry, AuctionWorkflowMode } from './auctionTypes';
import './AuctionCommandGeneratorModal.css';

type AuctionCommandGeneratorModalProps = {
  filenameDraft: string;
  profile: AuctionCommandProfile;
  stagesByMode: Record<AuctionWorkflowMode, AuctionCommandStages>;
  onFilenameChange: (value: string) => void;
  onSave: (profile: AuctionCommandProfile) => void;
  onDownload: (commands: string) => void;
  onClose: () => void;
};

function moveEntry(entries: AuctionCommandProfileEntry[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= entries.length) return entries;
  const next = [...entries];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function createCustomEntry(): AuctionCommandProfileEntry {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    kind: 'custom',
    label: 'Кастомная команда',
    command: '',
    enabled: true
  };
}

function entryTitle(entry: AuctionCommandProfileEntry) {
  return entry.kind === 'builtin' ? auctionCommandBlockLabels[entry.block] : entry.label;
}

export function AuctionCommandGeneratorModal({
  filenameDraft,
  profile,
  stagesByMode,
  onFilenameChange,
  onSave,
  onDownload,
  onClose
}: AuctionCommandGeneratorModalProps) {
  const [draft, setDraft] = useState(() => normalizeAuctionCommandProfile(profile));
  const generatedCommands = useMemo(() => buildAuctionCommandsFromProfile(stagesByMode[draft.mode], draft), [stagesByMode, draft]);

  const updateEntry = (id: string, updater: (entry: AuctionCommandProfileEntry) => AuctionCommandProfileEntry) => {
    setDraft((current) => ({
      ...current,
      entries: current.entries.map((entry) => entry.id === id ? updater(entry) : entry)
    }));
  };

  const saveDraft = () => {
    onSave(normalizeAuctionCommandProfile(draft));
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <form
        className="modal auction-command-generator-modal"
        role="dialog"
        aria-modal="true"
        aria-label="auction-command-generator"
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          saveDraft();
        }}
      >
        <div className="modal-header">
          <div>
            <h2>Генерация команд</h2>
            <span className="modal-subtitle">Выбери блоки, порядок и кастомные команды для итогового файла.</span>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>Закрыть</button>
        </div>

        <div className="auction-command-generator-grid">
          <section className="auction-command-generator-panel">
            <h3>Режим</h3>
            <div className="auction-command-generator-segmented">
              <button type="button" className={draft.mode === 'install' ? 'active' : ''} onClick={() => setDraft((current) => ({ ...current, mode: 'install' }))}>Новые слоты</button>
              <button type="button" className={draft.mode === 'existing' ? 'active' : ''} onClick={() => setDraft((current) => ({ ...current, mode: 'existing' }))}>По готовым ID</button>
            </div>

            <h3>Порядок блоков</h3>
            <div className="auction-command-entry-list">
              {draft.entries.map((entry, index) => (
                <article key={entry.id} className="auction-command-entry">
                  <label>
                    <input type="checkbox" checked={entry.enabled} onChange={(event) => updateEntry(entry.id, (item) => ({ ...item, enabled: event.target.checked }))} />
                    <span>{entryTitle(entry)}</span>
                  </label>
                  <div className="auction-command-entry-actions">
                    <button type="button" title="Выше" disabled={index === 0} onClick={() => setDraft((current) => ({ ...current, entries: moveEntry(current.entries, index, -1) }))}>↑</button>
                    <button type="button" title="Ниже" disabled={index === draft.entries.length - 1} onClick={() => setDraft((current) => ({ ...current, entries: moveEntry(current.entries, index, 1) }))}>↓</button>
                    {entry.kind === 'custom' ? <button type="button" title="Удалить" onClick={() => setDraft((current) => ({ ...current, entries: current.entries.filter((item) => item.id !== entry.id) }))}>×</button> : null}
                  </div>
                  {entry.kind === 'custom' ? (
                    <div className="auction-command-custom-editor">
                      <input value={entry.label} onChange={(event) => updateEntry(entry.id, (item) => item.kind === 'custom' ? { ...item, label: event.target.value } : item)} />
                      <textarea value={entry.command} rows={3} placeholder="/say custom command" onChange={(event) => updateEntry(entry.id, (item) => item.kind === 'custom' ? { ...item, command: event.target.value } : item)} />
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
            <button type="button" className="auction-command-add-custom" onClick={() => setDraft((current) => ({ ...current, entries: [...current.entries, createCustomEntry()] }))}>+ Кастомная команда</button>
          </section>

          <section className="auction-command-generator-panel">
            <h3>Итог</h3>
            <label className="field-block compact-field">
              <span>Имя файла</span>
              <input value={filenameDraft} onChange={(event) => onFilenameChange(event.target.value)} />
            </label>
            <div className="auction-command-file-preview"><span>Файл</span><strong>{sanitizeAuctionFilename(filenameDraft)}</strong></div>
            <textarea className="auction-command-output" readOnly value={generatedCommands} />
          </section>
        </div>

        <div className="auction-command-generator-footer">
          <button type="button" className="ghost-button" onClick={onClose}>Отмена</button>
          <button type="submit">Сохранить режим</button>
          <button type="button" disabled={!generatedCommands.trim()} onClick={() => { saveDraft(); onDownload(generatedCommands); }}>Скачать файл</button>
        </div>
      </form>
    </div>
  );
}
