import { useMemo, useState, type ReactNode } from 'react';
import { Panel } from '../../components/Panel';
import {
  auctionCurrencies,
  auctionCurrencyLabels,
  buildAuctionCommandStages,
  buildAuctionRunPricePreviews,
  createDefaultAuctionCurve,
  localDateTimeInputFromUtcMs,
  sanitizeAuctionFilename
} from './auctionCommands';
import { applyDayDefaultsToAuctions, cloneAuctionDayFolder, createAuctionDayFolder, createAuctionDraft, createInitialAuctionDayFolder, defaultTimezoneOffset, formatAuctionDayTitle, localDateTimeForDay, nextDayLocal, summarizeAuctionDayFolder } from './auctionDayFolders';
import { AuctionDayDetailsPanel } from './AuctionDayDetailsPanel';
import { AuctionDayFolderGrid } from './AuctionDayFolderGrid';
import { AuctionHelpTip } from './AuctionHelpTip';
import { AuctionItemsWorkspace } from './AuctionItemsWorkspace';
import { AuctionPriceGraph, type AuctionPriceGraphPointDetail, type AuctionPriceGraphRepeatMarker } from './AuctionPriceGraph';
import { AuctionRibbon, type AuctionRibbonTab } from './AuctionRibbon';
import { AuctionRunPricePreviewList } from './AuctionRunPricePreviewList';
import type { AuctionBuilderMode, AuctionCommandStage, AuctionCurrency, AuctionCurve, AuctionDayFolder, AuctionDraft, AuctionItemIdMode, AuctionItemOption, AuctionLotItem, AuctionRenderItemIcon, AuctionUiMode, AuctionWorkflowMode } from './auctionTypes';
import './AuctionBuilder.css';

type AuctionBuilderProps = {
  itemOptions: AuctionItemOption[];
  renderItemIcon: AuctionRenderItemIcon;
};

function HelpLabel({ text, children }: { text: string; children: ReactNode }) {
  return (
    <span className="auction-help-label">
      {text}
      <AuctionHelpTip label={`РџРѕРґСЃРєР°Р·РєР°: ${text}`}>{children}</AuctionHelpTip>
    </span>
  );
}

function downloadTextWithoutExtension(filename: string, text: string) {
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

export function AuctionBuilder({ itemOptions, renderItemIcon }: AuctionBuilderProps) {
  const now = Date.now();
  const [workflowMode, setWorkflowMode] = useState<AuctionWorkflowMode>('install');
  const [mode, setMode] = useState<AuctionBuilderMode>('config');
  const [ribbonTab, setRibbonTab] = useState<AuctionRibbonTab>('auctions');
  const [uiMode, setUiMode] = useState<AuctionUiMode>('normal');
  const [graphExpanded, setGraphExpanded] = useState(false);
  const [commandStage, setCommandStage] = useState<AuctionCommandStage>('create');
  const [graphCurrency, setGraphCurrency] = useState<AuctionCurrency>('DONATE');
  const [idMode, setIdMode] = useState<AuctionItemIdMode>('raw');
  const [commandPlayer, setCommandPlayer] = useState('@p');
  const [graphStartLocal] = useState(() => localDateTimeInputFromUtcMs(now, defaultTimezoneOffset()));
  const [dayFolders, setDayFolders] = useState<AuctionDayFolder[]>(() => [createInitialAuctionDayFolder(now, defaultTimezoneOffset())]);
  const [selectedDayFolderId, setSelectedDayFolderId] = useState('day-1');
  const [selectedAuctionId, setSelectedAuctionId] = useState('1');
  const [curve, setCurve] = useState<AuctionCurve>(() => createDefaultAuctionCurve());
  const [itemSearch, setItemSearch] = useState('');
  const [maxItemsPerAuction, setMaxItemsPerAuction] = useState(4);
  const [downloadModalOpen, setDownloadModalOpen] = useState(false);
  const [filenameDraft, setFilenameDraft] = useState(() => `auctions_${localDateTimeInputFromUtcMs(now, defaultTimezoneOffset()).replace(/[-:T]/g, '')}`);

  const selectedDayFolder = dayFolders.find((folder) => folder.id === selectedDayFolderId) ?? dayFolders[0];
  const auctions = selectedDayFolder?.auctions ?? [];
  const timezoneOffset = selectedDayFolder?.timezoneOffsetMinutes ?? defaultTimezoneOffset();
  const dayFolderSummaries = useMemo(() => Object.fromEntries(dayFolders.map((folder) => [
    folder.id,
    summarizeAuctionDayFolder({ folder, curve, graphStartLocal })
  ])), [dayFolders, curve, graphStartLocal]);
  const selectedAuction = auctions.find((auction) => auction.id === selectedAuctionId) ?? auctions[0];
  const commandStages = useMemo(() => buildAuctionCommandStages({ auctions, curve, idMode, timezoneOffsetMinutes: timezoneOffset, commandPlayer, graphStartLocal, workflowMode }), [auctions, curve, idMode, timezoneOffset, commandPlayer, graphStartLocal, workflowMode]);
  const commands = commandStages[commandStage];
  const runPricePreviews = useMemo(() => buildAuctionRunPricePreviews({ auctions, curve, graphStartLocal }), [auctions, curve, graphStartLocal]);
  const graphRunPricePreviews = useMemo(() => runPricePreviews.filter((preview) => preview.currency === graphCurrency), [runPricePreviews, graphCurrency]);
  const activeGraphDays = useMemo(() => graphRunPricePreviews.filter((preview) => preview.dayIndex === preview.priceDayIndex).map((preview) => preview.priceDayIndex), [graphRunPricePreviews]);
  const graphPointDetails = useMemo(() => graphRunPricePreviews.reduce<Record<number, AuctionPriceGraphPointDetail[]>>((details, preview) => {
    if (preview.dayIndex !== preview.priceDayIndex) return details;
    details[preview.priceDayIndex] = [
      ...(details[preview.priceDayIndex] ?? []),
      {
        label: preview.label,
        startPrice: preview.startPrice,
        stepPrice: preview.stepPrice,
        multiplier: preview.multiplier
      }
    ];
    return details;
  }, {}), [graphRunPricePreviews]);
  const graphRepeatMarkers = useMemo(() => graphRunPricePreviews
    .filter((preview) => preview.dayIndex !== preview.priceDayIndex)
    .map<AuctionPriceGraphRepeatMarker>((preview) => ({
      day: preview.dayIndex,
      priceDay: preview.priceDayIndex,
      label: preview.label,
      startPrice: preview.startPrice,
      stepPrice: preview.stepPrice,
      multiplier: preview.multiplier
    })), [graphRunPricePreviews]);
  const shouldRenderPriceGraph = uiMode === 'expert' || graphExpanded;
  const filteredItems = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    if (!query) return itemOptions.slice(0, 80);
    return itemOptions.filter((item) => `${item.raw} ${item.title} ${item.legacyId ?? ''}`.toLowerCase().includes(query)).slice(0, 120);
  }, [itemOptions, itemSearch]);
  const nbtSkippedCount = auctions.flatMap((auction) => auction.items).filter((item) => item.hasNbt).length;
  const selectedAuctionFull = selectedAuction ? selectedAuction.items.length >= maxItemsPerAuction : false;

  const updateSelectedDayFolder = (updater: (folder: AuctionDayFolder) => AuctionDayFolder) => {
    if (!selectedDayFolder) return;
    setDayFolders((current) => current.map((folder) => folder.id === selectedDayFolder.id ? updater(folder) : folder));
  };

  const updateSelectedDayAuctions = (updater: (auctions: AuctionDayFolder['auctions']) => AuctionDayFolder['auctions']) => {
    updateSelectedDayFolder((folder) => ({ ...folder, auctions: updater(folder.auctions) }));
  };

  const selectDayFolder = (id: string) => {
    const folder = dayFolders.find((item) => item.id === id);
    if (!folder) return;
    setSelectedDayFolderId(id);
    setSelectedAuctionId(folder.auctions[0]?.id ?? '');
  };

  const addDayFolder = () => {
    const nextIndex = dayFolders.length + 1;
    const dateLocal = selectedDayFolder ? nextDayLocal(selectedDayFolder.dateLocal) : localDateTimeInputFromUtcMs(now + 86_400_000, timezoneOffset).slice(0, 10);
    const next = createAuctionDayFolder({
      id: `day-${nextIndex}`,
      dateLocal,
      timezoneOffsetMinutes: timezoneOffset
    });
    setDayFolders((current) => [...current, next]);
    setSelectedDayFolderId(next.id);
    setSelectedAuctionId(next.auctions[0]?.id ?? '');
  };

  const copySelectedDayFolder = (sourceId = selectedDayFolder?.id) => {
    const source = dayFolders.find((folder) => folder.id === sourceId);
    if (!source) return;
    const nextIndex = dayFolders.length + 1;
    const copy = cloneAuctionDayFolder(source, {
      id: `day-${nextIndex}`,
      dateLocal: nextDayLocal(source.dateLocal)
    });
    setDayFolders((current) => [...current, copy]);
    setSelectedDayFolderId(copy.id);
    setSelectedAuctionId(copy.auctions[0]?.id ?? '');
  };

  const deleteSelectedDayFolder = () => {
    if (!selectedDayFolder || dayFolders.length <= 1) return;
    const confirmed = window.confirm(`РЈРґР°Р»РёС‚СЊ РїР°РїРєСѓ "${selectedDayFolder.title}" РІРјРµСЃС‚Рµ СЃРѕ РІСЃРµРјРё Р»РѕРєР°Р»СЊРЅС‹РјРё Р°СѓРєС†РёРѕРЅР°РјРё?`);
    if (!confirmed) return;
    const remaining = dayFolders.filter((folder) => folder.id !== selectedDayFolder.id);
    setDayFolders(remaining);
    setSelectedDayFolderId(remaining[0]?.id ?? '');
    setSelectedAuctionId(remaining[0]?.auctions[0]?.id ?? '');
  };

  const updateDayCurrency = (currency: AuctionCurrency) => {
    updateSelectedDayFolder((folder) => ({
      ...folder,
      currency,
      auctions: folder.auctions.map((auction) => ({ ...auction, currency }))
    }));
  };

  const updateDayDuration = (minutes: number) => {
    const defaultDurationMinutes = Math.max(1, Math.round(Number.isFinite(minutes) ? minutes : 1));
    updateSelectedDayFolder((folder) => ({
      ...folder,
      defaultDurationMinutes,
      auctions: folder.auctions.map((auction) => ({ ...auction, durationMinutes: defaultDurationMinutes }))
    }));
  };

  const updateDayStepPrice = (step: number) => {
    const defaultStepPrice = Math.max(1, Math.round(Number.isFinite(step) ? step : 1));
    updateSelectedDayFolder((folder) => ({
      ...folder,
      defaultStepPrice,
      auctions: folder.auctions.map((auction) => ({ ...auction, baseStepPrice: defaultStepPrice }))
    }));
  };

  const updateDayTitle = (title: string) => {
    updateSelectedDayFolder((folder) => ({ ...folder, title }));
  };

  const updateDayDate = (dateLocal: string) => {
    if (!dateLocal) return;
    updateSelectedDayFolder((folder) => ({
      ...folder,
      dateLocal,
      title: folder.title === formatAuctionDayTitle(folder.dateLocal) ? formatAuctionDayTitle(dateLocal) : folder.title,
      auctions: folder.auctions.map((auction) => ({
        ...auction,
        startLocal: localDateTimeForDay(dateLocal, auction.startLocal.includes('T') ? auction.startLocal.slice(11, 16) : '10:00')
      }))
    }));
  };

  const applySelectedDayDefaults = () => {
    updateSelectedDayFolder((folder) => applyDayDefaultsToAuctions(folder));
  };

  const resetSelectedDayPrices = () => {
    updateSelectedDayAuctions((current) => current.map((auction) => ({
      ...auction,
      items: auction.items.map((item) => ({ ...item, basePrice: 100 }))
    })));
  };

  const clearSelectedDayServerIds = () => {
    updateSelectedDayAuctions((current) => current.map((auction) => ({ ...auction, serverIds: {} })));
    setCommandStage('ids');
  };

  const checkSelectedDayErrors = () => {
    setCommandStage(commandStages.missingServerIds.length ? 'ids' : 'settings');
  };

  const updateAuction = (id: string, patch: Partial<AuctionDraft>) => {
    updateSelectedDayAuctions((current) => current.map((auction) => auction.id === id ? { ...auction, ...patch } : auction));
  };

  const renameAuction = (id: string, nextId: string) => {
    updateSelectedDayAuctions((current) => current.map((auction) => auction.id === id ? { ...auction, id: nextId } : auction));
    setSelectedAuctionId(nextId);
  };

  const updateServerId = (id: string, runIndex: number, serverId: string) => {
    updateSelectedDayAuctions((current) => current.map((auction) => auction.id === id
      ? { ...auction, serverIds: { ...auction.serverIds, [String(runIndex)]: serverId } }
      : auction));
  };

  const addAuction = () => {
    const nextIndex = auctions.length + 1;
    const next = createAuctionDraft(nextIndex, localDateTimeInputFromUtcMs(now + nextIndex * 86_400_000, timezoneOffset));
    updateSelectedDayAuctions((current) => [...current, next].slice(0, 90));
    setSelectedAuctionId(next.id);
  };

  const addItemToAuction = (option: AuctionItemOption) => {
    if (!selectedAuction) return;
    if (selectedAuction.items.length >= maxItemsPerAuction) return;
    const item: AuctionLotItem = { ...option, uid: `${option.raw}-${Date.now()}-${Math.random().toString(36).slice(2)}`, quantity: 1, basePrice: 100 };
    updateAuction(selectedAuction.id, { items: [...selectedAuction.items, item] });
  };

  const updateMaxItemsPerAuction = (value: number) => {
    const normalized = Math.max(1, Math.min(27, Math.round(Number.isFinite(value) ? value : 1)));
    setMaxItemsPerAuction(normalized);
  };

  const updateLotItem = (uid: string, patch: Partial<AuctionLotItem>) => {
    if (!selectedAuction) return;
    updateAuction(selectedAuction.id, { items: selectedAuction.items.map((item) => item.uid === uid ? { ...item, ...patch } : item) });
  };

  const removeLotItem = (uid: string) => {
    if (!selectedAuction) return;
    updateAuction(selectedAuction.id, { items: selectedAuction.items.filter((item) => item.uid !== uid) });
  };

  return (
    <div className="auction-builder">
      <AuctionRibbon
        activeTab={ribbonTab}
        selectedFolder={selectedDayFolder}
        uiMode={uiMode}
        workflowMode={workflowMode}
        timezoneOffset={timezoneOffset}
        onTabChange={setRibbonTab}
        onUiModeChange={setUiMode}
        onWorkflowModeChange={(nextMode) => {
          setWorkflowMode(nextMode);
          setCommandStage(nextMode === 'install' ? 'create' : 'ids');
        }}
        onNewDay={addDayFolder}
        onCopyDay={copySelectedDayFolder}
        onDeleteDay={deleteSelectedDayFolder}
        onCurrencyChange={updateDayCurrency}
        onDurationChange={updateDayDuration}
        onStepPriceChange={updateDayStepPrice}
        onTimezoneOffsetChange={(offset) => updateSelectedDayFolder((folder) => ({ ...folder, timezoneOffsetMinutes: offset }))}
        onPriceModeChange={(priceMode) => updateSelectedDayFolder((folder) => ({ ...folder, priceMode }))}
        onApplyDayDefaults={applySelectedDayDefaults}
        onResetPrices={resetSelectedDayPrices}
        onClearServerIds={clearSelectedDayServerIds}
        onCheckErrors={checkSelectedDayErrors}
        onSetBuilderMode={setMode}
        onSetCommandStage={setCommandStage}
        onOpenDownload={() => setDownloadModalOpen(true)}
      />

      <div className="auction-layout">
        <AuctionDayFolderGrid
          folders={dayFolders}
          selectedFolderId={selectedDayFolder?.id ?? ''}
          summaries={dayFolderSummaries}
          onSelectFolder={selectDayFolder}
          onCopyFolder={copySelectedDayFolder}
          onSetBuilderMode={setMode}
          onSetCommandStage={setCommandStage}
        />

        <AuctionDayDetailsPanel
          folder={selectedDayFolder}
          summary={selectedDayFolder ? dayFolderSummaries[selectedDayFolder.id] : undefined}
          selectedAuctionId={selectedAuctionId}
          maxItemsPerAuction={maxItemsPerAuction}
          uiMode={uiMode}
          commandStages={commandStages}
          onSelectAuction={setSelectedAuctionId}
          onAddAuction={addAuction}
          onTitleChange={updateDayTitle}
          onDateChange={updateDayDate}
          onCurrencyChange={updateDayCurrency}
          onDurationChange={updateDayDuration}
          onStepPriceChange={updateDayStepPrice}
          onPriceModeChange={(priceMode) => updateSelectedDayFolder((folder) => ({ ...folder, priceMode }))}
          onMaxItemsChange={updateMaxItemsPerAuction}
          onSetBuilderMode={setMode}
          onSetCommandStage={setCommandStage}
        />

        {selectedAuction && mode === 'config' ? (
          <Panel
            title="РќР°СЃС‚СЂРѕР№РєР° Р°СѓРєС†РёРѕРЅР°"
            subtitle="Р“СЂР°С„РёРє РјРµРЅСЏРµС‚ РїСЂРѕС†РµРЅС‚ С†РµРЅС‹ РїСЂРµРґРјРµС‚РѕРІ РІ РґРµРЅСЊ Р·Р°РїСѓСЃРєР° Р°СѓРєС†РёРѕРЅР°"
            actions={(
              <AuctionHelpTip label="РџРѕРґСЃРєР°Р·РєР°: РќР°СЃС‚СЂРѕР№РєР° Р°СѓРєС†РёРѕРЅР°">
                Р­С‚Рѕ РЅР°СЃС‚СЂРѕР№РєРё РІС‹Р±СЂР°РЅРЅРѕР№ Р»РѕРєР°Р»СЊРЅРѕР№ Р·Р°РіРѕС‚РѕРІРєРё: РґР°С‚Р°, РґР»РёС‚РµР»СЊРЅРѕСЃС‚СЊ, РІР°Р»СЋС‚Р°, РїРѕРІС‚РѕСЂС‹ Рё СЃРµСЂРІРµСЂРЅС‹Рµ ID.
                Р¦РµРЅС‹ РїСЂРµРґРјРµС‚РѕРІ Р·Р°РґР°СЋС‚СЃСЏ РІРѕ РІРєР»Р°РґРєРµ вЂњРџСЂРµРґРјРµС‚С‹ Рё С„Р°Р№Р»вЂќ, Р° РіСЂР°С„РёРє Р·РґРµСЃСЊ РјРµРЅСЏРµС‚ РёС… РїСЂРѕС†РµРЅС‚РѕРј РїРѕ РґРЅСЋ Р·Р°РїСѓСЃРєР°.
              </AuctionHelpTip>
            )}
          >
            <div className="auction-form-grid">
              <label className="field-block"><HelpLabel text="Р›РѕРєР°Р»СЊРЅР°СЏ РјРµС‚РєР°">Р’РЅСѓС‚СЂРµРЅРЅРµРµ РёРјСЏ Р·Р°РіРѕС‚РѕРІРєРё РІРЅСѓС‚СЂРё СЃР°Р№С‚Р°. Р­С‚Рѕ РЅРµ ID СЃРµСЂРІРµСЂР° Рё РЅРµ РїРѕРїР°РґР°РµС‚ РІ `/aca addItem`. РќСѓР¶РЅРѕ С‚РѕР»СЊРєРѕ С‡С‚РѕР±С‹ СЂР°Р·Р»РёС‡Р°С‚СЊ СЃС‚СЂРѕРєРё РґРѕ С‚РѕРіРѕ, РєР°Рє СЃРµСЂРІРµСЂ РІС‹РґР°СЃС‚ РЅР°СЃС‚РѕСЏС‰РёР№ ID. РџСЂРёРјРµСЂ: `donate_july_01`.</HelpLabel><input value={selectedAuction.id} onChange={(event) => renameAuction(selectedAuction.id, event.target.value)} /></label>
              <label className="field-block"><HelpLabel text="Р’Р°Р»СЋС‚Р°">Р’Р°Р»СЋС‚Р° Р°СѓРєС†РёРѕРЅР°. РћС‚ РЅРµС‘ Р·Р°РІРёСЃРёС‚, РєР°РєРѕР№ РіСЂР°С„РёРє РїСЂРѕС†РµРЅС‚Р° Р±СѓРґРµС‚ РїСЂРёРјРµРЅС‘РЅ: РєСѓР±РёРєСЃС‹, РєСЂРёСЃС‚Р°Р»Р»С‹ РёР»Рё Р±РѕРЅСѓСЃС‹.</HelpLabel><select value={selectedAuction.currency} onChange={(event) => updateAuction(selectedAuction.id, { currency: event.target.value as AuctionCurrency })}>{auctionCurrencies.map((currency) => <option key={currency} value={currency}>{currency} В· {auctionCurrencyLabels[currency]}</option>)}</select></label>
              <label className="field-block wide"><HelpLabel text="РќР°Р·РІР°РЅРёРµ">РќР°Р·РІР°РЅРёРµ, РєРѕС‚РѕСЂРѕРµ Р±СѓРґРµС‚ РѕС‚РїСЂР°РІР»РµРЅРѕ РІ РєРѕРјР°РЅРґСѓ РЅР°СЃС‚СЂРѕР№РєРё Р°СѓРєС†РёРѕРЅР°. РџСЂРёРјРµСЂ: вЂњРСЋР»СЊСЃРєРёР№ РЅР°Р±РѕСЂ РєСЂРёСЃС‚Р°Р»Р»РѕРІвЂќ.</HelpLabel><input value={selectedAuction.name} onChange={(event) => updateAuction(selectedAuction.id, { name: event.target.value })} /></label>
              <label className="field-block wide"><HelpLabel text="РћРїРёСЃР°РЅРёРµ">Р”РѕРїРѕР»РЅРёС‚РµР»СЊРЅС‹Р№ С‚РµРєСЃС‚ РґР»СЏ Р°СѓРєС†РёРѕРЅР°. Р•СЃР»Рё РїРѕР»Рµ РїСѓСЃС‚РѕРµ, РєРѕРјР°РЅРґР° РѕРїРёСЃР°РЅРёСЏ РЅРµ Р±СѓРґРµС‚ РґРѕР±Р°РІР»РµРЅР°.</HelpLabel><input value={selectedAuction.description} onChange={(event) => updateAuction(selectedAuction.id, { description: event.target.value })} /></label>
              <label className="field-block"><HelpLabel text="РЎС‚Р°СЂС‚">Р›РѕРєР°Р»СЊРЅР°СЏ РґР°С‚Р° Рё РІСЂРµРјСЏ Р·Р°РїСѓСЃРєР°. Р­С‚Р° РґР°С‚Р° РІС‹Р±РёСЂР°РµС‚ С‚РѕС‡РєСѓ РЅР° РіСЂР°С„РёРєРµ, РїРѕСЌС‚РѕРјСѓ РїСЂРѕС†РµРЅС‚ С†РµРЅС‹ Р±РµСЂС‘С‚СЃСЏ РёРјРµРЅРЅРѕ РґР»СЏ СЌС‚РѕРіРѕ РґРЅСЏ.</HelpLabel><input type="datetime-local" value={selectedAuction.startLocal} onChange={(event) => updateAuction(selectedAuction.id, { startLocal: event.target.value })} /></label>
              <label className="field-block"><HelpLabel text="Р”Р»РёС‚РµР»СЊРЅРѕСЃС‚СЊ, РјРёРЅ">РЎРєРѕР»СЊРєРѕ РјРёРЅСѓС‚ Р°СѓРєС†РёРѕРЅ Р±СѓРґРµС‚ Р°РєС‚РёРІРµРЅ. РљРѕРЅРµС† СЃС‡РёС‚Р°РµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё: СЃС‚Р°СЂС‚ РїР»СЋСЃ РґР»РёС‚РµР»СЊРЅРѕСЃС‚СЊ.</HelpLabel><input type="number" min={1} value={selectedAuction.durationMinutes} onChange={(event) => updateAuction(selectedAuction.id, { durationMinutes: Number(event.target.value) })} /></label>
              <label className="field-block"><HelpLabel text="РЁР°Рі СЃС‚Р°РІРєРё">Р‘Р°Р·РѕРІС‹Р№ С€Р°Рі РїРѕРІС‹С€РµРЅРёСЏ СЃС‚Р°РІРєРё. РћРЅ С‚РѕР¶Рµ СѓРјРЅРѕР¶Р°РµС‚СЃСЏ РЅР° РїСЂРѕС†РµРЅС‚ РіСЂР°С„РёРєР° РґР»СЏ РґР°С‚С‹ Р·Р°РїСѓСЃРєР°. РџСЂРёРјРµСЂ: С€Р°Рі 10 Рё РіСЂР°С„РёРє +25% РґР°РґСѓС‚ 13.</HelpLabel><input type="number" min={1} value={selectedAuction.baseStepPrice} onChange={(event) => updateAuction(selectedAuction.id, { baseStepPrice: Number(event.target.value) })} /></label>
              <label className="field-block switch-field"><HelpLabel text="РџР»Р°РЅРѕРІС‹Р№ Р·Р°РїСѓСЃРє">Р•СЃР»Рё РІРєР»СЋС‡РµРЅРѕ, Р°СѓРєС†РёРѕРЅ РѕСЃС‚Р°С‘С‚СЃСЏ РІ SETUP Рё РґРѕР±Р°РІР»СЏРµС‚СЃСЏ РєРѕРјР°РЅРґР° СЂР°СЃРїРёСЃР°РЅРёСЏ. Р•СЃР»Рё РІС‹РєР»СЋС‡РµРЅРѕ, РёСЃРїРѕР»СЊР·СѓРµС‚СЃСЏ РІС‹Р±СЂР°РЅРЅРѕРµ СЃРѕСЃС‚РѕСЏРЅРёРµ Р·Р°РїСѓСЃРєР°.</HelpLabel><input type="checkbox" checked={selectedAuction.planned} onChange={(event) => updateAuction(selectedAuction.id, { planned: event.target.checked })} /></label>
              <label className="field-block switch-field"><HelpLabel text="РџРѕРІС‚РѕСЂСЏС‚СЊ">РЎРѕР·РґР°С‘С‚ РЅРµСЃРєРѕР»СЊРєРѕ Р·Р°РїСѓСЃРєРѕРІ СЌС‚РѕР№ Р¶Рµ Р·Р°РіРѕС‚РѕРІРєРё. Р”Р»СЏ РєР°Р¶РґРѕРіРѕ Р·Р°РїСѓСЃРєР° СЃРµСЂРІРµСЂ РІС‹РґР°СЃС‚ РѕС‚РґРµР»СЊРЅС‹Р№ ID, Рё РєР°Р¶РґС‹Р№ ID РЅСѓР¶РЅРѕ РІРїРёСЃР°С‚СЊ РІ С€Р°РіРµ 2.</HelpLabel><input type="checkbox" checked={selectedAuction.repeatEnabled} onChange={(event) => updateAuction(selectedAuction.id, { repeatEnabled: event.target.checked })} /></label>
              <label className="field-block"><HelpLabel text="РџРѕРІС‚РѕСЂРѕРІ">РљРѕР»РёС‡РµСЃС‚РІРѕ Р·Р°РїСѓСЃРєРѕРІ РІ РїСЂРµРґРµР»Р°С… 3 РјРµСЃСЏС†РµРІ. РџСЂРёРјРµСЂ: 4 РїРѕРІС‚РѕСЂР° СЃ РёРЅС‚РµСЂРІР°Р»РѕРј 7 РґРЅРµР№ СЃРѕР·РґР°РґСѓС‚ 4 СЃС‚СЂРѕРєРё ID.</HelpLabel><input type="number" min={1} max={90} value={selectedAuction.repeatCount} onChange={(event) => updateAuction(selectedAuction.id, { repeatCount: Number(event.target.value) })} /></label>
              <label className="field-block"><HelpLabel text="РРЅС‚РµСЂРІР°Р», РґРЅРµР№">Р§РµСЂРµР· СЃРєРѕР»СЊРєРѕ РґРЅРµР№ РїРѕРІС‚РѕСЂСЏРµС‚СЃСЏ Р·Р°РїСѓСЃРє. РџСЂРёРјРµСЂ: СЃС‚Р°СЂС‚ 10.07 Рё РёРЅС‚РµСЂРІР°Р» 30 РґРЅРµР№ РґР°СЃС‚ СЃР»РµРґСѓСЋС‰РёР№ Р·Р°РїСѓСЃРє 09.08.</HelpLabel><input type="number" min={1} value={selectedAuction.repeatEveryDays} onChange={(event) => updateAuction(selectedAuction.id, { repeatEveryDays: Number(event.target.value) })} /></label>
            </div>
            <section className="auction-server-id-section">
              <div className="settings-section-title compact">
                <h3>
                  РЁР°Рі 2: ID СЃ СЃРµСЂРІРµСЂР°
                  <AuctionHelpTip label="РџРѕРґСЃРєР°Р·РєР°: ID СЃ СЃРµСЂРІРµСЂР°">
                    РЎРµСЂРІРµСЂРЅС‹Р№ ID РїРѕСЏРІР»СЏРµС‚СЃСЏ С‚РѕР»СЊРєРѕ РїРѕСЃР»Рµ РІС‹РїРѕР»РЅРµРЅРёСЏ РєРѕРјР°РЅРґС‹ `/aca create`. Р•РіРѕ РЅСѓР¶РЅРѕ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ РёР· РѕС‚РІРµС‚Р° СЃРµСЂРІРµСЂР° Рё РІРїРёСЃР°С‚СЊ СЃСЋРґР°.
                    РџСЂРёРјРµСЂ: СЃРµСЂРІРµСЂ РІС‹РґР°Р» `27`, Р·РЅР°С‡РёС‚ РєРѕРјР°РЅРґС‹ РїСЂРµРґРјРµС‚РѕРІ Р±СѓРґСѓС‚ РёСЃРїРѕР»СЊР·РѕРІР°С‚СЊ `/aca addItem 27`.
                  </AuctionHelpTip>
                </h3>
                <span>РџРѕСЃР»Рµ РІС‹РїРѕР»РЅРµРЅРёСЏ `/aca create` СЃРµСЂРІРµСЂ РІС‹РґР°СЃС‚ ID. Р’РїРёС€Рё РµРіРѕ СЃСЋРґР° РґР»СЏ РєР°Р¶РґРѕРіРѕ Р·Р°РїСѓСЃРєР°.</span>
              </div>
              <div className="auction-server-id-grid">
                {Array.from({ length: selectedAuction.repeatEnabled ? Math.max(1, selectedAuction.repeatCount) : 1 }, (_, index) => (
                  <label key={index} className="field-block">
                    <HelpLabel text={index === 0 ? selectedAuction.name : `${selectedAuction.name} #${index + 1}`}>
                      РџРѕР»Рµ РґР»СЏ РЅР°СЃС‚РѕСЏС‰РµРіРѕ ID, РєРѕС‚РѕСЂС‹Р№ СЃРіРµРЅРµСЂРёСЂРѕРІР°Р» СЃРµСЂРІРµСЂ. Р”Р»СЏ РїРѕРІС‚РѕСЂРѕРІ РєР°Р¶РґС‹Р№ Р·Р°РїСѓСЃРє РїРѕР»СѓС‡Р°РµС‚ СЃРІРѕР№ РѕС‚РґРµР»СЊРЅС‹Р№ ID.
                    </HelpLabel>
                    <input
                      value={selectedAuction.serverIds[String(index)] ?? ''}
                      onChange={(event) => updateServerId(selectedAuction.id, index, event.target.value)}
                      placeholder="ID, РєРѕС‚РѕСЂС‹Р№ РІС‹РґР°Р» СЃРµСЂРІРµСЂ"
                    />
                  </label>
                ))}
              </div>
              {commandStages.missingServerIds.length ? <div className="inline-hint inline-hint-warning">Р‘РµР· СЌС‚РёС… ID С€Р°РіРё РїСЂРµРґРјРµС‚РѕРІ Рё РЅР°СЃС‚СЂРѕРµРє Р±СѓРґСѓС‚ РїСЂРѕРїСѓС‰РµРЅС‹: {commandStages.missingServerIds.join(', ')}</div> : null}
            </section>
            <div className="auction-toolbar-row">
              <label className="field-block compact-field"><HelpLabel text="Р“СЂР°С„РёРє">Р’С‹Р±РёСЂР°РµС‚ РІР°Р»СЋС‚Сѓ РіСЂР°С„РёРєР°. РўРѕС‡РєРё РЅР° РіСЂР°С„РёРєРµ РјРµРЅСЏСЋС‚ РїСЂРѕС†РµРЅС‚ С†РµРЅС‹ РґР»СЏ РІСЃРµС… РїСЂРµРґРјРµС‚РѕРІ СЌС‚РѕР№ РІР°Р»СЋС‚С‹ РІ РґРµРЅСЊ Р·Р°РїСѓСЃРєР°.</HelpLabel><select value={graphCurrency} onChange={(event) => setGraphCurrency(event.target.value as AuctionCurrency)}>{auctionCurrencies.map((currency) => <option key={currency} value={currency}>{auctionCurrencyLabels[currency]}</option>)}</select></label>
              <span>РўР°С‰Рё С‚РѕС‡РєСѓ РІРІРµСЂС…/РІРЅРёР·: РїСЂРѕС†РµРЅС‚ РјРµРЅСЏРµС‚ С†РµРЅС‹ РІСЃРµС… РїСЂРµРґРјРµС‚РѕРІ СЌС‚РѕР№ РІР°Р»СЋС‚С‹ РІ СЌС‚РѕС‚ РґРµРЅСЊ.</span>
            </div>
            {shouldRenderPriceGraph ? (
              <>
                <AuctionPriceGraph
                  values={curve[graphCurrency]}
                  activeDays={activeGraphDays}
                  pointDetails={graphPointDetails}
                  repeatMarkers={graphRepeatMarkers}
                  onChangeDay={(day, value) => setCurve((current) => ({ ...current, [graphCurrency]: current[graphCurrency].map((item, index) => index === day ? value : item) }))}
                />
                <AuctionRunPricePreviewList previews={graphRunPricePreviews} />
              </>
            ) : (
              <div className="inline-hint auction-graph-lazy-note">
                Р“СЂР°С„РёРє РЅРµ СЃС‚СЂРѕРёС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё РІ РѕР±С‹С‡РЅРѕРј СЂРµР¶РёРјРµ. Р­С‚Рѕ СѓСЃРєРѕСЂСЏРµС‚ СЂР°Р±РѕС‚Сѓ СЃ РїР°РїРєР°РјРё; РѕС‚РєСЂРѕР№ РіСЂР°С„РёРє С‚РѕР»СЊРєРѕ РєРѕРіРґР° РЅСѓР¶РЅРѕ РјРµРЅСЏС‚СЊ РјРЅРѕР¶РёС‚РµР»Рё.
                <button type="button" className="secondary-button" onClick={() => setGraphExpanded(true)}>РћС‚РєСЂС‹С‚СЊ РіСЂР°С„РёРє</button>
              </div>
            )}
          </Panel>
        ) : null}

        {selectedAuction && mode === 'items' ? (
          <AuctionItemsWorkspace
            selectedAuction={selectedAuction}
            idMode={idMode}
            commandPlayer={commandPlayer}
            itemSearch={itemSearch}
            filteredItems={filteredItems}
            selectedAuctionFull={selectedAuctionFull}
            maxItemsPerAuction={maxItemsPerAuction}
            nbtSkippedCount={nbtSkippedCount}
            renderItemIcon={renderItemIcon}
            onIdModeChange={setIdMode}
            onCommandPlayerChange={setCommandPlayer}
            onItemSearchChange={setItemSearch}
            onAddItem={addItemToAuction}
            onUpdateItem={updateLotItem}
            onRemoveItem={removeLotItem}
          />
        ) : null}
      </div>

      <Panel
        title="РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ С„Р°Р№Р»Р°"
        subtitle="Р¤Р°Р№Р» СЃРєР°С‡РёРІР°РµС‚СЃСЏ Р±РµР· СЂР°СЃС€РёСЂРµРЅРёСЏ"
        actions={(
          <AuctionHelpTip label="РџРѕРґСЃРєР°Р·РєР°: РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ С„Р°Р№Р»Р°">
            Р—РґРµСЃСЊ РїРѕРєР°Р·С‹РІР°РµС‚СЃСЏ РІС‹Р±СЂР°РЅРЅС‹Р№ С€Р°Рі РєРѕРјР°РЅРґ. РЎРєР°С‡РёРІР°РЅРёРµ СЃРѕС…СЂР°РЅСЏРµС‚ РёРјРµРЅРЅРѕ Р°РєС‚РёРІРЅС‹Р№ С€Р°Рі: СЃРѕР·РґР°РЅРёРµ СЃР»РѕС‚РѕРІ, СЃРїРёСЃРѕРє ID, РґРѕР±Р°РІР»РµРЅРёРµ РїСЂРµРґРјРµС‚РѕРІ РёР»Рё С„РёРЅР°Р»СЊРЅСѓСЋ РЅР°СЃС‚СЂРѕР№РєСѓ.
            Р”Р»СЏ РїРѕР»РЅРѕРіРѕ РїСЂРѕС†РµСЃСЃР° РІС‹РїРѕР»РЅСЏР№ С€Р°РіРё РїРѕ РїРѕСЂСЏРґРєСѓ.
          </AuctionHelpTip>
        )}
      >
        <div className="auction-step-tabs" aria-label="auction-command-stage">
          {workflowMode === 'install' ? <button type="button" title="РљРѕРјР°РЅРґС‹ /aca create СЃРѕР·РґР°СЋС‚ РїСѓСЃС‚С‹Рµ СЃРµСЂРІРµСЂРЅС‹Рµ Р°СѓРєС†РёРѕРЅС‹. РџРѕСЃР»Рµ СЌС‚РѕРіРѕ СЃРµСЂРІРµСЂ РІС‹РґР°СЃС‚ ID." className={commandStage === 'create' ? 'active' : ''} onClick={() => setCommandStage('create')}>1. РЎРѕР·РґР°С‚СЊ СЃР»РѕС‚С‹</button> : null}
          <button type="button" title="РЁРїР°СЂРіР°Р»РєР°, РєСѓРґР° РІРїРёСЃР°С‚СЊ ID, РєРѕС‚РѕСЂС‹Рµ СЃРµСЂРІРµСЂ РІС‹РґР°Р» РїРѕСЃР»Рµ СЃРѕР·РґР°РЅРёСЏ СЃР»РѕС‚РѕРІ." className={commandStage === 'ids' ? 'active' : ''} onClick={() => setCommandStage('ids')}>2. Р’С‹РїРёСЃР°С‚СЊ ID</button>
          <button type="button" title="РљРѕРјР°РЅРґС‹ /clear, /give Рё /aca addItem РґР»СЏ РґРѕР±Р°РІР»РµРЅРёСЏ РїСЂРµРґРјРµС‚РѕРІ РІ СѓР¶Рµ РёР·РІРµСЃС‚РЅС‹Рµ СЃРµСЂРІРµСЂРЅС‹Рµ ID." className={commandStage === 'items' ? 'active' : ''} onClick={() => setCommandStage('items')}>3. Р—Р°РєРёРЅСѓС‚СЊ РїСЂРµРґРјРµС‚С‹</button>
          <button type="button" title="РљРѕРјР°РЅРґС‹ С„РёРЅР°Р»СЊРЅРѕР№ РЅР°СЃС‚СЂРѕР№РєРё: РЅР°Р·РІР°РЅРёРµ, РґР°С‚С‹, РІР°Р»СЋС‚Р°, С†РµРЅР°, С€Р°Рі СЃС‚Р°РІРєРё, СЃРѕСЃС‚РѕСЏРЅРёРµ Рё СЂР°СЃРїРёСЃР°РЅРёРµ." className={commandStage === 'settings' ? 'active' : ''} onClick={() => setCommandStage('settings')}>4. РќР°СЃС‚СЂРѕРёС‚СЊ Рё Р·Р°РїСѓСЃС‚РёС‚СЊ</button>
        </div>
        <pre className="raw-block auction-command-preview">{commands || 'РљРѕРјР°РЅРґС‹ РїРѕСЏРІСЏС‚СЃСЏ РїРѕСЃР»Рµ РЅР°СЃС‚СЂРѕР№РєРё Р°СѓРєС†РёРѕРЅР°.'}</pre>
      </Panel>

      {downloadModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setDownloadModalOpen(false)}>
          <form
            className="modal cloud-save-modal"
            role="dialog"
            aria-modal="true"
            aria-label="auction-download-file"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              downloadTextWithoutExtension(filenameDraft, commands);
              setDownloadModalOpen(false);
            }}
          >
            <div className="modal-header">
              <div>
                <h2>РЎРєР°С‡Р°С‚СЊ С„Р°Р№Р» РєРѕРјР°РЅРґ</h2>
                <span className="modal-subtitle">Р Р°СЃС€РёСЂРµРЅРёРµ РЅРµ РґРѕР±Р°РІР»СЏРµС‚СЃСЏ: РёС‚РѕРіРѕРІС‹Р№ С„Р°Р№Р» Р±СѓРґРµС‚ Р±РµР· .txt.</span>
              </div>
              <button type="button" className="ghost-button" onClick={() => setDownloadModalOpen(false)}>Р—Р°РєСЂС‹С‚СЊ</button>
            </div>
            <div className="settings-modal-body">
              <label className="field-block">
                <HelpLabel text="РРјСЏ С„Р°Р№Р»Р°">
                  РРјСЏ РёС‚РѕРіРѕРІРѕРіРѕ С„Р°Р№Р»Р° РєРѕРјР°РЅРґ. Р Р°СЃС€РёСЂРµРЅРёРµ СѓРґР°Р»СЏРµС‚СЃСЏ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё, РґР°Р¶Рµ РµСЃР»Рё РІРїРёСЃР°С‚СЊ `.txt`.
                  РџСЂРёРјРµСЂ: `auction_step_3` СЃРєР°С‡Р°РµС‚СЃСЏ РєР°Рє С„Р°Р№Р» Р±РµР· СЂР°СЃС€РёСЂРµРЅРёСЏ.
                </HelpLabel>
                <input autoFocus value={filenameDraft} onChange={(event) => setFilenameDraft(event.target.value)} />
              </label>
              <div className="cloud-save-preview"><span>РС‚РѕРі</span><strong>{sanitizeAuctionFilename(filenameDraft)}</strong></div>
              <div className="inline-actions cloud-save-actions">
                <button type="button" className="ghost-button" onClick={() => setDownloadModalOpen(false)}>РћС‚РјРµРЅР°</button>
                <button type="submit" disabled={!commands.trim()}>РЎРєР°С‡Р°С‚СЊ</button>
              </div>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
