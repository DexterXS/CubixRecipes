import { useCallback, useMemo, useState } from 'react';

import { RecipeView } from '../types';
import { parseText } from '../services/api';

interface Translator {
  (key: string): string;
}

interface UseParseWorkflowOptions {
  t: Translator;
  onRecipeParsed: (recipe: RecipeView, inputText: string) => void;
  onParseApplied?: () => void;
  onStatusChange?: (status: string) => void;
  onApiStatusChange?: (status: string) => void;
  onParseResultChange?: (result: string) => void;
}

export interface ParseWorkflowState {
  input: string;
  setInput: (value: string) => void;
  parseHint: string | null;
  parseMessage: string;
  parseTone: 'default' | 'success' | 'warning';
  backendState: 'online' | 'offline' | 'unknown';
  isParsing: boolean;
  hasParsedRecipe: boolean;
  parseSuccessToken: number;
  canParse: boolean;
  requestParse: (value?: string) => Promise<void>;
  handlePastedText: (value: string, options?: { autoParse?: boolean }) => Promise<void>;
  markBackendOnline: () => void;
  markBackendOffline: (message?: string) => void;
  resetParseState: () => void;
}

function normalizeErrorMessage(error: unknown, t: Translator): string {
  const raw = error instanceof Error ? error.message : '';
  const message = raw.trim();

  if (!message) {
    return t('parseStatus.unknownError');
  }

  const lower = message.toLowerCase();
  if (lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('load failed')) {
    return t('parseStatus.backendOfflineDetail');
  }
  if (lower.includes('http 500')) {
    return t('parseStatus.serverErrorDetail');
  }
  return message;
}

export function useParseWorkflow(options: UseParseWorkflowOptions): ParseWorkflowState {
  const { t, onRecipeParsed, onParseApplied, onStatusChange, onApiStatusChange, onParseResultChange } = options;

  const [input, setInputState] = useState('');
  const [parseHint, setParseHint] = useState<string | null>(null);
  const [parseMessage, setParseMessage] = useState(t('parseStatus.idle'));
  const [parseTone, setParseTone] = useState<'default' | 'success' | 'warning'>('default');
  const [backendState, setBackendState] = useState<'online' | 'offline' | 'unknown'>('unknown');
  const [isParsing, setIsParsing] = useState(false);
  const [hasParsedRecipe, setHasParsedRecipe] = useState(false);
  const [parseSuccessToken, setParseSuccessToken] = useState(0);

  const syncStatus = useCallback((status: string) => {
    onStatusChange?.(status);
  }, [onStatusChange]);

  const setInput = useCallback((value: string) => {
    setInputState(value);
    setHasParsedRecipe(false);
    if (!value.trim()) {
      setParseHint(null);
      setParseMessage(t('parseStatus.waitingForInput'));
      setParseTone('default');
      return;
    }
    setParseHint(t('parseStatus.readyHint'));
    setParseMessage(t('parseStatus.textReady'));
    setParseTone('default');
  }, [t]);

  const markBackendOnline = useCallback(() => {
    setBackendState('online');
  }, []);

  const markBackendOffline = useCallback((message?: string) => {
    setBackendState('offline');
    setParseTone('warning');
    setParseMessage(message ?? t('parseStatus.backendOfflineDetail'));
  }, [t]);

  const resetParseState = useCallback(() => {
    setParseHint(null);
    setParseMessage(t('parseStatus.waitingForInput'));
    setParseTone('default');
    setHasParsedRecipe(false);
    setParseSuccessToken(0);
  }, [t]);

  const requestParse = useCallback(async (value?: string) => {
    const nextValue = (value ?? input).trim();
    if (!nextValue || isParsing) {
      return;
    }

    setInputState(nextValue);
    setIsParsing(true);
    setParseHint(null);
    setParseTone('default');
    setParseMessage(t('status.parsing'));
    syncStatus(t('status.parsing'));
    onApiStatusChange?.(t('parseStatus.parsingShort'));

    try {
      const result = await parseText(nextValue);
      setBackendState('online');
      onApiStatusChange?.(t('values.ok'));

      if (result.recipe) {
        onRecipeParsed(result.recipe, nextValue);
        onParseApplied?.();
        setHasParsedRecipe(true);
        setParseSuccessToken((current) => current + 1);
        setParseTone('success');
        setParseMessage(t('parseStatus.recipeParsed'));
        syncStatus(t('parseStatus.gridUpdated'));
        onParseResultChange?.(result.recipe.recipe_type);
        return;
      }

      const unsupportedMessage = result.item
        ? `${t('parseStatus.onlyItemFound')}: ${result.item.raw}`
        : t('parseStatus.unsupportedFormat');
      setHasParsedRecipe(false);
      setParseTone('warning');
      setParseMessage(unsupportedMessage);
      syncStatus(unsupportedMessage);
      onParseResultChange?.(result.item?.raw ?? t('parseStatus.unsupportedShort'));
      onApiStatusChange?.(t('values.error'));
    } catch (error) {
      const message = normalizeErrorMessage(error, t);
      const finalMessage = `${t('status.parseError')}: ${message}`;
      const isOffline = message === t('parseStatus.backendOfflineDetail');
      setBackendState(isOffline ? 'offline' : backendState === 'unknown' ? 'unknown' : backendState);
      setHasParsedRecipe(false);
      setParseTone('warning');
      setParseMessage(finalMessage);
      syncStatus(finalMessage);
      onApiStatusChange?.(t('values.error'));
      onParseResultChange?.(message);
    } finally {
      setIsParsing(false);
    }
  }, [backendState, input, isParsing, onApiStatusChange, onParseApplied, onParseResultChange, onRecipeParsed, syncStatus, t]);

  const handlePastedText = useCallback(async (value: string, options?: { autoParse?: boolean }) => {
    const normalized = value.replace(/\r\n/g, '\n');
    setInputState(normalized);
    setHasParsedRecipe(false);

    if (!normalized.trim()) {
      setParseHint(null);
      setParseMessage(t('parseStatus.waitingForInput'));
      setParseTone('default');
      return;
    }

    if (options?.autoParse ?? true) {
      setParseMessage(t('parseStatus.pasteDetected'));
      await requestParse(normalized);
      return;
    }

    setParseHint(t('parseStatus.readyHint'));
    setParseMessage(t('parseStatus.textPastedManual'));
    setParseTone('default');
    syncStatus(t('parseStatus.textPastedManual'));
  }, [requestParse, syncStatus, t]);

  const canParse = useMemo(() => Boolean(input.trim()) && !isParsing, [input, isParsing]);

  return {
    input,
    setInput,
    parseHint,
    parseMessage,
    parseTone,
    backendState,
    isParsing,
    hasParsedRecipe,
    parseSuccessToken,
    canParse,
    requestParse,
    handlePastedText,
    markBackendOnline,
    markBackendOffline,
    resetParseState
  };
}
