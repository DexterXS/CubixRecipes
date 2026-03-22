interface ParseComposerLabels {
  title: string;
  helper: string;
  paste: string;
  clear: string;
  parse: string;
  parsing: string;
  shortcut: string;
  backendOnline: string;
  backendOffline: string;
  backendUnknown: string;
  statusLabel: string;
  backendLabel: string;
}

interface ParseComposerProps {
  labels: ParseComposerLabels;
  input: string;
  parseMessage: string;
  parseHint: string | null;
  parseTone: 'default' | 'success' | 'warning';
  backendState: 'online' | 'offline' | 'unknown';
  isParsing: boolean;
  canParse: boolean;
  onInputChange: (value: string) => void;
  onParse: () => void;
  onPaste: () => Promise<void>;
  onClear: () => void;
  onPasteText: (value: string) => Promise<void>;
}

export function ParseComposer(props: ParseComposerProps) {
  const backendText = props.backendState === 'online'
    ? props.labels.backendOnline
    : props.backendState === 'offline'
      ? props.labels.backendOffline
      : props.labels.backendUnknown;

  return (
    <div className="parse-composer">
      <div className="field-header parse-composer-header">
        <div>
          <span>{props.labels.title}</span>
          <p className="parse-composer-helper">{props.labels.helper}</p>
        </div>
        <div className="inline-actions">
          <button type="button" className="secondary-button" disabled={props.isParsing} onClick={() => void props.onPaste()}>{props.labels.paste}</button>
          <button type="button" className="ghost-button" disabled={props.isParsing && !props.input} onClick={props.onClear}>{props.labels.clear}</button>
        </div>
      </div>

      <div className="parse-composer-main">
        <textarea
          aria-label="paste-input"
          value={props.input}
          onChange={(event) => props.onInputChange(event.target.value)}
          onPaste={(event) => {
            const pasted = event.clipboardData.getData('text');
            void props.onPasteText(pasted);
            event.preventDefault();
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
              event.preventDefault();
              props.onParse();
            }
          }}
        />
        <div className="parse-callout" data-tone={props.parseTone}>
          <button type="button" className="parse-primary-button" disabled={!props.canParse} onClick={props.onParse}>
            {props.isParsing ? props.labels.parsing : props.labels.parse}
          </button>
          <div className="parse-callout-copy">
            <strong>{props.labels.shortcut}</strong>
            <span>{props.parseHint ?? props.parseMessage}</span>
          </div>
        </div>
      </div>

      <div className="parse-status-row" role="status" aria-live="polite">
        <div className={`parse-status-pill ${props.backendState}`}>
          <span>{props.labels.backendLabel}</span>
          <strong>{backendText}</strong>
        </div>
        <div className={`parse-status-pill ${props.parseTone}`}>
          <span>{props.labels.statusLabel}</span>
          <strong>{props.parseMessage}</strong>
        </div>
      </div>
    </div>
  );
}
