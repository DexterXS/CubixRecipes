import { useMemo, useState } from 'react';
import { sanitizeAuctionFilename } from './auctionCommands';
import {
  auctionCommandScopeLabels,
  auctionStateFilterLabels,
  auctionWorkflowModeLabels,
  buildAuctionCommandsFromProfile,
  getAuctionCommandModeEntries,
  normalizeAuctionCommandProfile,
  setAuctionCommandModeEntries
} from './auctionCommandProfile';
import type {
  AuctionCommandEntryScope,
  AuctionCommandProfile,
  AuctionCommandProfileEntry,
  AuctionCurve,
  AuctionDraft,
  AuctionItemIdMode,
  AuctionState,
  AuctionWorkflowMode
} from './auctionTypes';
import './AuctionCommandGeneratorModal.css';

type AuctionCommandGeneratorModalProps = {
  filenameDraft: string;
  profile: AuctionCommandProfile;
  auctions: AuctionDraft[];
  curve: AuctionCurve;
  idMode: AuctionItemIdMode;
  timezoneOffsetMinutes: number;
  graphStartLocal: string;
  onFilenameChange: (value: string) => void;
  onSave: (profile: AuctionCommandProfile) => void;
  onDownload: (commands: string) => void;
  onClose: () => void;
};

const stateFilterOrder: AuctionState[] = ['ACTIVE', 'SETUP', 'PAUSED', 'CLOSED', 'ENDED'];

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
    label: 'Своя команда',
    template: '',
    scope: 'file',
    enabled: true
  };
}

export function AuctionCommandGeneratorModal({
  filenameDraft,
  profile,
  auctions,
  curve,
  idMode,
  timezoneOffsetMinutes,
  graphStartLocal,
  onFilenameChange,
  onSave,
  onDownload,
  onClose
}: AuctionCommandGeneratorModalProps) {
  const [draft, setDraft] = useState(() => normalizeAuctionCommandProfile(profile));
  const entries = getAuctionCommandModeEntries(draft);
  const matchingLotCount = auctions.filter((auction) => draft.stateFilters.includes(auction.state)).length;
  const generatedCommands = useMemo(() => buildAuctionCommandsFromProfile({
    auctions,
    curve,
    idMode,
    timezoneOffsetMinutes,
    graphStartLocal,
    profile: draft
  }), [auctions, curve, idMode, timezoneOffsetMinutes, graphStartLocal, draft]);

  const setMode = (mode: AuctionWorkflowMode) => {
    setDraft((current) => normalizeAuctionCommandProfile({ ...current, mode }));
  };

  const setEntries = (nextEntries: AuctionCommandProfileEntry[]) => {
    setDraft((current) => setAuctionCommandModeEntries(current, current.mode, nextEntries));
  };

  const updateEntry = (id: string, updater: (entry: AuctionCommandProfileEntry) => AuctionCommandProfileEntry) => {
    setEntries(entries.map((entry) => entry.id === id ? updater(entry) : entry));
  };

  const toggleState = (state: AuctionState, checked: boolean) => {
    setDraft((current) => {
      const next = checked
        ? [...current.stateFilters, state]
        : current.stateFilters.filter((item) => item !== state);
      return normalizeAuctionCommandProfile({ ...current, stateFilters: next });
    });
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
        <div className="modal-header auction-command-generator-header">
          <h2>Генерация команд</h2>
          <button type="button" className="ghost-button" onClick={onClose}>Закрыть</button>
        </div>

        <div className="auction-command-generator-grid">
          <section className="auction-command-generator-panel controls">
            <div className="auction-command-control-row">
              <h3>Режим</h3>
              <div className="auction-command-generator-segmented">
                {(['install', 'existing'] as AuctionWorkflowMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={draft.mode === mode ? 'active' : ''}
                    onClick={() => setMode(mode)}
                  >
                    {auctionWorkflowModeLabels[mode]}
                  </button>
                ))}
              </div>
            </div>

            <div className="auction-command-control-row">
              <h3>Статусы</h3>
              <div className="auction-command-status-filter">
                {stateFilterOrder.map((state) => (
                  <label key={state}>
                    <input
                      type="checkbox"
                      checked={draft.stateFilters.includes(state)}
                      onChange={(event) => toggleState(state, event.target.checked)}
                    />
                    <span>{auctionStateFilterLabels[state]}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="field-block compact-field">
              <span>Ник / цель</span>
              <input
                value={draft.playerName}
                onChange={(event) => setDraft((current) => normalizeAuctionCommandProfile({ ...current, playerName: event.target.value }))}
              />
            </label>

            <div className="auction-command-entry-list">
              {entries.map((entry, index) => (
                <article key={entry.id} className={`auction-command-entry ${entry.enabled ? 'enabled' : ''}`}>
                  <div className="auction-command-entry-top">
                    <label className="auction-command-entry-check">
                      <input
                        type="checkbox"
                        checked={entry.enabled}
                        onChange={(event) => updateEntry(entry.id, (item) => ({ ...item, enabled: event.target.checked }))}
                      />
                      <span />
                    </label>
                    <input
                      className="auction-command-entry-name"
                      value={entry.label}
                      onChange={(event) => updateEntry(entry.id, (item) => ({ ...item, label: event.target.value }))}
                    />
                    <div className="auction-command-entry-actions">
                      <button type="button" title="Выше" disabled={index === 0} onClick={() => setEntries(moveEntry(entries, index, -1))}>↑</button>
                      <button type="button" title="Ниже" disabled={index === entries.length - 1} onClick={() => setEntries(moveEntry(entries, index, 1))}>↓</button>
                      {entry.kind === 'custom' ? (
                        <button type="button" title="Удалить" onClick={() => setEntries(entries.filter((item) => item.id !== entry.id))}>×</button>
                      ) : null}
                    </div>
                  </div>
                  <div className="auction-command-entry-meta">
                    {entry.kind === 'custom' ? (
                      <select
                        value={entry.scope}
                        onChange={(event) => updateEntry(entry.id, (item) => item.kind === 'custom'
                          ? { ...item, scope: event.target.value as AuctionCommandEntryScope }
                          : item)}
                      >
                        {Object.entries(auctionCommandScopeLabels).map(([scope, label]) => (
                          <option key={scope} value={scope}>{label}</option>
                        ))}
                      </select>
                    ) : (
                      <span>{auctionCommandScopeLabels[entry.scope]}</span>
                    )}
                  </div>
                  <textarea
                    value={entry.template}
                    rows={entry.scope === 'file' ? 2 : 3}
                    onChange={(event) => updateEntry(entry.id, (item) => ({ ...item, template: event.target.value }))}
                  />
                </article>
              ))}
            </div>
            <button type="button" className="auction-command-add-custom" onClick={() => setEntries([...entries, createCustomEntry()])}>
              + Команда
            </button>
          </section>

          <section className="auction-command-generator-panel preview">
            <div className="auction-command-preview-head">
              <h3>Превью</h3>
              <span>{matchingLotCount} лотов</span>
            </div>
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
