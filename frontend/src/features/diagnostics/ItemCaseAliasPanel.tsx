import type { ItemCaseAliasReport } from '../../types';

type ItemCaseAliasPanelProps = {
  report: ItemCaseAliasReport | null;
  status: string;
  canManage: boolean;
  generating: boolean;
  logUploading: boolean;
  manualSaving: boolean;
  manualAliasKey: string;
  manualAliasValue: string;
  onGenerate: () => void;
  onRefresh: () => void;
  onLogFilesChange: (files: FileList | File[]) => void;
  onManualAliasKeyChange: (value: string) => void;
  onManualAliasValueChange: (value: string) => void;
  onSaveManualAlias: () => void;
};

export function ItemCaseAliasPanel({
  report,
  status,
  canManage,
  generating,
  logUploading,
  manualSaving,
  manualAliasKey,
  manualAliasValue,
  onGenerate,
  onRefresh,
  onLogFilesChange,
  onManualAliasKeyChange,
  onManualAliasValueChange,
  onSaveManualAlias
}: ItemCaseAliasPanelProps) {
  const summary = report?.summary;
  const manualAliases = report?.manualItemAliases ?? {};
  const logAliases = report?.logItemAliases ?? {};
  const matchedByKey = new Map((report?.matchedItems ?? []).map((item) => [item.lower_key, item]));
  const missingByKey = new Map((report?.missingItems ?? []).map((item) => [item.lower_key, item]));
  const aliasRows = report
    ? Object.entries(report.itemAliases)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([lowerKey, original]) => ({
        lowerKey,
        original,
        source: manualAliases[lowerKey] ? 'manual' : logAliases[lowerKey] ? 'log' : 'auto',
        item: matchedByKey.get(lowerKey) ?? missingByKey.get(lowerKey) ?? null
      }))
    : [];

  return (
    <div className="debug-section-grid">
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Словарь регистра</h3>
          <span>Временный lowercase → original-case словарь из загруженных в Облако .zs и сверка с itempanel.csv.</span>
        </div>
        <div className="file-actions">
          <button type="button" className="secondary-button" disabled={!canManage || generating} onClick={onGenerate}>Сгенерировать отчет</button>
          <button type="button" className="ghost-button" disabled={!canManage || generating} onClick={onRefresh}>Обновить статус</button>
        </div>
        <label className="case-alias-log-upload">
          <span>fml-client-latest.log</span>
          <input
            aria-label="item-case-alias-fml-log"
            type="file"
            accept=".log,text/plain"
            disabled={!canManage || logUploading}
            onChange={(event) => {
              onLogFilesChange(event.currentTarget.files ?? []);
              event.currentTarget.value = '';
            }}
          />
        </label>
        {status ? <div className="inline-status inline-status-default">{status}</div> : null}
        {summary ? (
          <div className="kv-grid">
            <div><span>Файлов .zs</span><strong>{summary.scriptFiles}</strong></div>
            <div><span>Item refs</span><strong>{summary.scriptItemRefs}</strong></div>
            <div><span>Уникальных ключей</span><strong>{summary.uniqueItemKeys}</strong></div>
            <div><span>Mixed-case</span><strong>{summary.mixedCaseItemAliases}</strong></div>
            <div><span>Совпало с itempanel</span><strong>{summary.matchedItemKeys}</strong></div>
            <div><span>Не найдено</span><strong>{summary.missingItemKeys}</strong></div>
            <div><span>Из FML log</span><strong>{summary.logItemAliases ?? Object.keys(logAliases).length}</strong></div>
            <div><span>Ручных значений</span><strong>{summary.manualItemAliases ?? Object.keys(manualAliases).length}</strong></div>
            <div><span>Конфликтов item</span><strong>{summary.itemConflicts}</strong></div>
            <div><span>Мобов/NBT ids</span><strong>{summary.uniqueEntityKeys}</strong></div>
          </div>
        ) : (
          <div className="inline-hint inline-hint-warning">Отчет еще не создан. Нажми генерацию, чтобы собрать словарь и список пропусков.</div>
        )}
        {report ? (
          <div className="case-alias-paths">
            <span>Источник: <code>{report.sourceLabel ?? summary?.sourceLabel ?? summary?.scriptsDir ?? 'Облако'}</code></span>
            <span>Словарь: <code>{report.aliasesPath}</code></span>
            <span>Отчет: <code>{report.reportPath}</code></span>
            {report.fmlLogAliasesPath ? <span>FML log: <code>{report.fmlLogAliasesPath}</code></span> : null}
            {report.fmlLogSummary ? <span>FML source: <code>{report.fmlLogSummary.sourceFilename ?? 'fml-client-latest.log'} ({report.fmlLogSummary.totalMatches} строк)</code></span> : null}
            {report.manualAliasesPath ? <span>Ручные значения: <code>{report.manualAliasesPath}</code></span> : null}
          </div>
        ) : null}
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Добавить вручную</h3>
          <span>Ключ хранится в нижнем регистре, значение сохраняет оригинальный регистр из рецепта.</span>
        </div>
        <div className="case-alias-manual-form">
          <label className="field-block">
            <span>Ключ lowercase</span>
            <input aria-label="manual-alias-key" type="text" value={manualAliasKey} onChange={(event) => onManualAliasKeyChange(event.target.value)} placeholder="draconicevolution:customspawner" />
          </label>
          <label className="field-block">
            <span>Значение original-case</span>
            <input aria-label="manual-alias-value" type="text" value={manualAliasValue} onChange={(event) => onManualAliasValueChange(event.target.value)} placeholder="DraconicEvolution:customSpawner" />
          </label>
          <button type="button" className="secondary-button" aria-label="save-manual-alias" disabled={!canManage || manualSaving} onClick={onSaveManualAlias}>Добавить в словарь</button>
        </div>
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Таблица словаря</h3>
          <span>{aliasRows.length ? `${aliasRows.length} значений` : 'Словарь появится после генерации или ручного добавления.'}</span>
        </div>
        {aliasRows.length ? (
          <div className="case-alias-table-wrap">
            <table className="case-alias-table">
              <thead>
                <tr>
                  <th>lowercase key</th>
                  <th>original-case</th>
                  <th>Источник</th>
                  <th>Файлы</th>
                </tr>
              </thead>
              <tbody>
                {aliasRows.map((row) => (
                  <tr key={row.lowerKey}>
                    <td><code>{row.lowerKey}</code></td>
                    <td><code>{row.original}</code></td>
                    <td><span className={`case-alias-source case-alias-source-${row.source}`}>{row.source === 'manual' ? 'ручной' : row.source === 'log' ? 'log' : 'cloud'}</span></td>
                    <td>{row.item?.files.slice(0, 3).join(', ') ?? (row.source === 'log' ? report?.fmlLogSummary?.sourceFilename ?? 'fml-client-latest.log' : '-')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Не найдено в itempanel</h3>
          <span>{summary ? `${summary.missingItemKeys} ключей` : 'Список появится после генерации.'}</span>
        </div>
        {report?.missingByMod && report.missingByMod.length ? (
          <div className="missing-mod-list">
            {report.missingByMod.slice(0, 16).map((item) => (
              <div key={item.modid} className="admin-file-row">
                <strong>{item.modid || 'unknown'}</strong>
                <span>{item.count}</span>
              </div>
            ))}
          </div>
        ) : null}
        {report?.missingItems && report.missingItems.length ? (
          <div className="admin-file-list case-alias-missing-list">
            {report.missingItems.slice(0, 80).map((item) => (
              <div key={item.lower_key} className="admin-file-row">
                <div>
                  <strong>{item.original}</strong>
                  <span>{item.lower_key}</span>
                </div>
                <span>{item.files[0] ?? ''}</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
