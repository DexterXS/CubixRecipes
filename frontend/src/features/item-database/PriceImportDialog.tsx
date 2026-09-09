import { useMemo, useState } from 'react';
import { importItemPrices, type PriceImportItem, type PriceImportResult } from '../../services/api';
import './PriceImportDialog.css';

type Props = { onClose: () => void; onImported: () => Promise<void> | void };

type SourceRow = {
  registryData?: string;
  metadata?: number;
  nbt?: string;
  price?: number;
  flags?: string[];
};

export function PriceImportDialog({ onClose, onImported }: Props) {
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<PriceImportItem[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PriceImportResult | null>(null);
  const [processed, setProcessed] = useState(0);

  const stats = useMemo(() => {
    if (!rows.length) return null;
    const prices = rows.map((row) => row.price).filter(Number.isFinite);
    const mods = new Set(rows.map((row) => row.registry_data.split(':', 1)[0] || 'unknown'));
    const suspicious = prices.filter((price) => price >= 999999).length;
    return {
      count: rows.length,
      mods: mods.size,
      min: Math.min(...prices),
      max: Math.max(...prices),
      suspicious
    };
  }, [rows]);

  async function readFile(file: File) {
    setError('');
    setResult(null);
    setFileName(file.name);
    try {
      const parsed = JSON.parse(await file.text()) as { items?: Record<string, SourceRow> };
      if (!parsed || typeof parsed !== 'object' || !parsed.items || typeof parsed.items !== 'object') {
        throw new Error('Ожидается JSON с объектом items.');
      }
      const next: PriceImportItem[] = [];
      for (const value of Object.values(parsed.items)) {
        if (!value || typeof value !== 'object') continue;
        const registry = String(value.registryData || '').trim();
        const price = Number(value.price);
        if (!registry || !Number.isFinite(price)) continue;
        next.push({
          registry_data: registry,
          metadata: Number.isFinite(Number(value.metadata)) ? Number(value.metadata) : 0,
          nbt: typeof value.nbt === 'string' ? value.nbt : null,
          price,
          flags: Array.isArray(value.flags) ? value.flags.map(String) : []
        });
      }
      if (!next.length) throw new Error('В файле не найдено корректных цен.');
      setRows(next);
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : 'Не удалось прочитать JSON.');
    }
  }

  async function runImport() {
    if (!rows.length || busy) return;
    setBusy(true);
    setError('');
    setProcessed(0);
    try {
      const batchSize = 400;
      let total: PriceImportResult = {
        processed: 0, matched_rows: 0, matched_items: 0, unmatched_count: 0,
        unmatched: [], invalid: 0, server_id: 'production', source_name: fileName
      };
      for (let start = 0; start < rows.length; start += batchSize) {
        const response = await importItemPrices(rows.slice(start, start + batchSize), fileName || 'server-prices.json');
        total = {
          ...response,
          processed: total.processed + response.processed,
          matched_rows: total.matched_rows + response.matched_rows,
          matched_items: total.matched_items + response.matched_items,
          unmatched_count: total.unmatched_count + response.unmatched_count,
          invalid: total.invalid + response.invalid,
          unmatched: [...total.unmatched, ...response.unmatched].slice(0, 100)
        };
        setProcessed(Math.min(start + batchSize, rows.length));
      }
      setResult(total);
      await onImported();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка импорта цен.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="price-import-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="price-import-dialog" role="dialog" aria-modal="true" aria-label="Загрузка цен предметов">
      <header>
        <div><small>Item Intelligence</small><h2>Загрузка цен предметов</h2></div>
        <button type="button" className="price-import-close" onClick={onClose}>×</button>
      </header>

      <label className="price-import-drop">
        <strong>{fileName || 'Выберите JSON-файл с ценами'}</strong>
        <span>Поддерживается формат storageMinPrices: registryData + metadata + nbt + price + flags</span>
        <input type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
      </label>

      {stats ? <div className="price-import-stats">
        <span><b>{stats.count}</b> записей</span><span><b>{stats.mods}</b> модов</span>
        <span>min <b>{stats.min}</b></span><span>max <b>{stats.max}</b></span>
        <span className={stats.suspicious ? 'warn' : ''}><b>{stats.suspicious}</b> ≥ 999999</span>
      </div> : null}

      {rows.length ? <div className="price-import-preview">
        {rows.slice(0, 8).map((row, index) => <div key={`${row.registry_data}:${row.metadata}:${index}`}>
          <code>{row.registry_data}:{row.metadata}</code><strong>{row.price}</strong>
        </div>)}
        {rows.length > 8 ? <small>+ ещё {rows.length - 8}</small> : null}
      </div> : null}

      {busy ? <div className="price-import-progress"><div style={{ width: `${Math.round((processed / rows.length) * 100)}%` }} /></div> : null}
      {error ? <div className="price-import-error">{error}</div> : null}
      {result ? <div className="price-import-result">
        Импортировано: <b>{result.matched_rows}</b> строк · обновлено предметов: <b>{result.matched_items}</b> · не найдено: <b>{result.unmatched_count}</b> · некорректных: <b>{result.invalid}</b>
      </div> : null}

      <footer>
        <button type="button" className="ghost-button" onClick={onClose}>Закрыть</button>
        <button type="button" className="primary-button" disabled={!rows.length || busy} onClick={() => void runImport()}>{busy ? `Импорт ${processed}/${rows.length}` : 'Импортировать цены'}</button>
      </footer>
    </section>
  </div>;
}
