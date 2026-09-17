import { type ChangeEvent, type DragEvent, type ReactNode, useEffect, useState } from 'react';
import type { ModIconAdminStatus, ModIconAtlasManifest } from '../types';

type UploadHandler = (files: FileList | File[]) => Promise<boolean> | void;

interface WipeUpdateModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string | null;
  summary: Record<string, unknown> | null;
  catalogEntryCount: number;
  modIconStatus: ModIconAdminStatus | null;
  modIconManifest: ModIconAtlasManifest | null;
  csvUploading: boolean;
  csvMessage: string;
  jsonUploading: boolean;
  jsonMessage: string;
  oreDictUploading: boolean;
  oreDictMessage: string;
  merging: boolean;
  modIconUploading: boolean;
  modIconGenerating: boolean;
  modIconMessage: string;
  staticRefreshing: boolean;
  atlasMessage: string;
  onUploadCsv: UploadHandler;
  onUploadJson: UploadHandler;
  onUploadOreDict: UploadHandler;
  onUploadModArchive: UploadHandler;
  onMerge: () => Promise<boolean> | void;
  onGenerateModAtlases: () => Promise<boolean> | void;
  onRefreshStatic: () => Promise<boolean> | void;
  onRefreshCatalog: () => Promise<unknown> | void;
  onOpenMergedCsv: () => void;
}

type WorkflowState = {
  csvReady: boolean;
  jsonReady: boolean;
  merged: boolean;
  modAtlasesReady: boolean;
  staticApplied: boolean;
};

function countValue(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function initialWorkflow(
  summary: Record<string, unknown> | null,
  catalogEntryCount: number,
  modIconStatus: ModIconAdminStatus | null,
  modIconManifest: ModIconAtlasManifest | null
): WorkflowState {
  const csvReady = countValue(summary?.csv_entries) > 0 || countValue(summary?.entries) > 0 || catalogEntryCount > 0;
  const archiveCount = modIconStatus?.archives.length ?? modIconManifest?.archives.length ?? 0;
  const atlasCount = modIconManifest?.atlases.length ?? modIconStatus?.manifest?.atlases.length ?? 0;
  const statusKnown = Boolean(modIconStatus || modIconManifest);
  return {
    csvReady,
    jsonReady: countValue(summary?.snbt_rows) > 0,
    merged: summary?.merged_csv_exists === true,
    modAtlasesReady: statusKnown && (archiveCount === 0 || atlasCount > 0),
    staticApplied: false
  };
}

function uploadLabel(
  title: string,
  description: string,
  status: string,
  disabled: boolean,
  uploading: boolean,
  accept: string,
  onUpload: UploadHandler
) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      void onUpload(event.target.files);
      event.currentTarget.value = '';
    }
  };
  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    if (!disabled) void onUpload(event.dataTransfer.files);
  };
  return (
    <label className={`wipe-upload-card ${disabled ? 'is-disabled' : ''}`} onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
      <input type="file" accept={accept} disabled={disabled || uploading} onChange={handleChange} />
      <span className="wipe-upload-card-title">{title}</span>
      <span className="wipe-upload-card-description">{description}</span>
      <span className="wipe-upload-card-action">{uploading ? 'Загрузка...' : 'Выбрать файл'}</span>
      <span className="wipe-upload-card-status">{status}</span>
    </label>
  );
}

function Step({ number, state, title, description, children }: { number: number; state: 'done' | 'active' | 'blocked'; title: string; description: string; children: ReactNode }) {
  const marker = state === 'done' ? '✓' : state === 'blocked' ? '🔒' : String(number);
  return (
    <section className={`wipe-step wipe-step-${state}`}>
      <div className="wipe-step-marker" aria-hidden="true">{marker}</div>
      <div className="wipe-step-content">
        <div className="wipe-step-heading">
          <div>
            <h3>{number}. {title}</h3>
            <p>{description}</p>
          </div>
          <span className="wipe-step-state">{state === 'done' ? 'Готово' : state === 'blocked' ? 'Заблокировано' : 'Текущий шаг'}</span>
        </div>
        {children}
      </div>
    </section>
  );
}

export function WipeUpdateModal({
  isOpen,
  onClose,
  serverName,
  summary,
  catalogEntryCount,
  modIconStatus,
  modIconManifest,
  csvUploading,
  csvMessage,
  jsonUploading,
  jsonMessage,
  oreDictUploading,
  oreDictMessage,
  merging,
  modIconUploading,
  modIconGenerating,
  modIconMessage,
  staticRefreshing,
  atlasMessage,
  onUploadCsv,
  onUploadJson,
  onUploadOreDict,
  onUploadModArchive,
  onMerge,
  onGenerateModAtlases,
  onRefreshStatic,
  onRefreshCatalog,
  onOpenMergedCsv
}: WipeUpdateModalProps) {
  const [workflow, setWorkflow] = useState<WorkflowState>(() => initialWorkflow(summary, catalogEntryCount, modIconStatus, modIconManifest));
  const archiveCount = modIconStatus?.archives.length ?? modIconManifest?.archives.length ?? 0;
  const atlasCount = modIconManifest?.atlases.length ?? modIconStatus?.manifest?.atlases.length ?? 0;
  const statusKnown = Boolean(modIconStatus || modIconManifest);
  const finalReady = workflow.csvReady && workflow.merged && workflow.modAtlasesReady;
  const currentStep = !workflow.csvReady ? 1 : !workflow.merged ? 2 : !workflow.modAtlasesReady ? 3 : 4;
  const summaryValue = (key: string) => String(summary?.[key] ?? '—');

  useEffect(() => {
    if (!isOpen) {
      setWorkflow(initialWorkflow(summary, catalogEntryCount, modIconStatus, modIconManifest));
    }
  }, [isOpen, summary, catalogEntryCount, modIconStatus, modIconManifest]);

  useEffect(() => {
    if (!isOpen || !statusKnown) return;
    const serverAlreadyHasAtlases = archiveCount === 0 || atlasCount > 0;
    if (serverAlreadyHasAtlases) {
      setWorkflow((current) => current.modAtlasesReady ? current : { ...current, modAtlasesReady: true });
    }
  }, [isOpen, statusKnown, archiveCount, atlasCount]);

  if (!isOpen) return null;

  const uploadCsv = async (files: FileList | File[]) => {
    if (await onUploadCsv(files)) {
      setWorkflow((current) => ({ ...current, csvReady: true, merged: false, staticApplied: false }));
    }
  };
  const uploadJson = async (files: FileList | File[]) => {
    if (await onUploadJson(files)) {
      setWorkflow((current) => ({ ...current, jsonReady: true, merged: false, staticApplied: false }));
    }
  };
  const uploadOreDict = async (files: FileList | File[]) => {
    await onUploadOreDict(files);
  };
  const uploadModArchive = async (files: FileList | File[]) => {
    if (await onUploadModArchive(files)) {
      setWorkflow((current) => ({ ...current, modAtlasesReady: false, staticApplied: false }));
    }
  };
  const merge = async () => {
    if (await onMerge()) {
      setWorkflow((current) => ({ ...current, merged: true, staticApplied: false }));
    }
  };
  const generateModAtlases = async () => {
    if (await onGenerateModAtlases()) {
      setWorkflow((current) => ({ ...current, modAtlasesReady: true, staticApplied: false }));
    }
  };
  const refreshStatic = async () => {
    if (await onRefreshStatic()) {
      setWorkflow((current) => ({ ...current, staticApplied: true }));
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal wipe-update-modal wipe-update-modal-flow" role="dialog" aria-modal="true" aria-label="Обновление вайпа" onClick={(event) => event.stopPropagation()}>
        <div className="wipe-modal-header">
          <div>
            <h2>Обновление данных вайпа</h2>
            <p>Последовательная публикация каталога, иконок и статической версии.</p>
          </div>
          <div className="wipe-modal-header-actions">
            <span className="wipe-server-pill">Сервер: {serverName || 'текущий'}</span>
            <span className={`wipe-change-pill ${workflow.staticApplied ? 'is-ready' : ''}`}>{workflow.staticApplied ? 'Изменения применены' : `Активен шаг ${currentStep} из 4`}</span>
            <button type="button" className="ghost-button" onClick={onClose}>Закрыть</button>
          </div>
        </div>

        <div className="wipe-flow" aria-label="Последовательность обновления">
          <Step number={1} state={workflow.csvReady ? 'done' : 'active'} title="Исходные файлы" description="CSV обязателен. JSON и OreDict подключаются только при необходимости.">
            <div className="wipe-upload-grid">
              {uploadLabel('itempanel.csv', 'Предметы, ID, meta и названия', workflow.csvReady ? `Загружен · ${summaryValue('csv_entries')} строк` : 'Нужно загрузить CSV', false, csvUploading, '.csv,text/csv', uploadCsv)}
              {uploadLabel('itempanel.json', 'Построчный SNBT/NBT, необязательно', workflow.jsonReady ? `Загружен · ${summaryValue('snbt_rows')} строк` : 'Не загружен · можно пропустить', !workflow.csvReady, jsonUploading, '.json,application/json,text/plain', uploadJson)}
            </div>
            <div className="wipe-optional-row">
              <span><strong>Дополнительно:</strong> oredict.txt используется для &lt;ore:group&gt;.</span>
              <label className={`wipe-inline-upload ${oreDictUploading ? 'is-loading' : ''}`}>
                <input type="file" accept=".txt,text/plain" disabled={oreDictUploading} onChange={(event) => { if (event.target.files) { void uploadOreDict(event.target.files); event.currentTarget.value = ''; } }} />
                {oreDictUploading ? 'Загрузка...' : 'Загрузить OreDict'}
              </label>
            </div>
            {csvMessage || jsonMessage || oreDictMessage ? <div className="wipe-step-message">{csvMessage || jsonMessage || oreDictMessage}</div> : null}
          </Step>

          <Step number={2} state={workflow.merged ? 'done' : workflow.csvReady ? 'active' : 'blocked'} title="Объединить и проверить каталог" description="JSON применяется к CSV только после объединения по строкам.">
            <div className="wipe-action-row">
              <div className="wipe-metrics">
                <span>CSV<strong>{summaryValue('csv_entries')}</strong></span>
                <span>SNBT<strong>{summaryValue('snbt_rows')}</strong></span>
                <span>NBT-варианты<strong>{summaryValue('nbt_entries')}</strong></span>
              </div>
              <button type="button" className="secondary-button" disabled={!workflow.csvReady || merging} onClick={() => void merge()}>{merging ? 'Объединяю...' : 'Объединить файлы'}</button>
            </div>
            <div className="wipe-step-footer">
              <span>{workflow.merged ? 'Объединённый каталог готов к сборке атласов.' : workflow.csvReady ? 'После этого разблокируется работа с атласами.' : 'Сначала загрузите itempanel.csv на шаге 1.'}</span>
              <div className="inline-actions">
                <button type="button" className="ghost-button" disabled={!workflow.merged} onClick={() => void onRefreshCatalog()}>Обновить каталог</button>
                <button type="button" className="ghost-button" disabled={!workflow.merged || summary?.merged_csv_exists !== true} onClick={onOpenMergedCsv}>Открыть merged CSV</button>
              </div>
            </div>
          </Step>

          <Step number={3} state={workflow.modAtlasesReady ? 'done' : workflow.merged ? 'active' : 'blocked'} title="Иконки и атласы" description="ZIP можно загрузить только после проверки каталога; после замены ZIP атласы нужно пересобрать.">
            <div className="wipe-upload-grid wipe-upload-grid-icons">
              {uploadLabel('Архивы иконок модов', 'modid_x32.zip или modid_x256.zip', workflow.merged ? (modIconUploading ? 'Загружаю архив...' : `${archiveCount} архив(ов) · можно добавить ещё`) : 'Заблокировано до шага 2', !workflow.merged, modIconUploading, '.zip,application/zip', uploadModArchive)}
              <div className={`wipe-generation-card ${!workflow.merged || !archiveCount ? 'is-disabled' : ''}`}>
                <div><strong>Атласы модов</strong><span>{!workflow.merged ? 'Сначала объедините каталог' : !archiveCount ? 'ZIP-архивы не загружены' : `${atlasCount} готово`}</span></div>
                <button type="button" className="secondary-button" disabled={!workflow.merged || !archiveCount || modIconGenerating} onClick={() => void generateModAtlases()}>{modIconGenerating ? 'Генерирую...' : 'Сгенерировать атласы'}</button>
              </div>
            </div>
            <div className="wipe-step-footer"><span>{!statusKnown ? 'Получаю статус атласов...' : !archiveCount ? 'Модовые атласы пропущены: архивов нет.' : workflow.modAtlasesReady ? `Атласы готовы: ${atlasCount}.` : (modIconMessage || 'После загрузки ZIP запустите генерацию.')}</span></div>
          </Step>

          <Step number={4} state={workflow.staticApplied ? 'done' : finalReady ? 'active' : 'blocked'} title="Применить обновление" description="Единая финальная операция создаёт новую серверную статическую версию.">
            <div className="wipe-final-card">
              <div>
                <strong>Будет сохранено на сервере</strong>
                <span>Каталог · JSON атласа · PNG атласа · версия статических файлов</span>
              </div>
              <button type="button" className="primary-button" disabled={!finalReady || staticRefreshing} onClick={() => void refreshStatic()}>{staticRefreshing ? 'Применяю...' : 'Применить всё и обновить статику'}</button>
            </div>
            <div className={`wipe-apply-status ${workflow.staticApplied ? 'is-success' : ''}`}>
              {workflow.staticApplied ? (atlasMessage || 'Готово: новая версия опубликована и будет использоваться после перезапуска.') : finalReady ? 'Все обязательные этапы завершены. Можно применять обновление.' : `Сначала завершите: ${!workflow.csvReady ? 'шаг 1' : !workflow.merged ? 'шаг 2' : 'шаг 3'}.`}
            </div>
          </Step>
        </div>

        <div className="wipe-modal-footer"><span>Текущий каталог: {catalogEntryCount || summaryValue('entries')} записей</span><span>После публикации новая версия становится активной для выбранного сервера.</span></div>
      </div>
    </div>
  );
}
