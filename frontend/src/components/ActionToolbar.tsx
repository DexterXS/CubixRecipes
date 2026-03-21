interface ActionToolbarLabels {
  work: string;
  saveGroup: string;
  helpGroup: string;
  parse: string;
  paste: string;
  createNew: string;
  clear: string;
  save: string;
  saveAs: string;
  help: string;
  wiki: string;
}

interface ActionToolbarProps {
  labels: ActionToolbarLabels;
  onParse: () => void;
  onPaste: () => Promise<void>;
  onCreateNew: () => void;
  onClear: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onHelp: () => void;
  onWiki: () => void;
}

export function ActionToolbar(props: ActionToolbarProps) {
  const { labels } = props;
  return (
    <div className="action-toolbar sticky-toolbar">
      <div className="toolbar-group">
        <span className="toolbar-label">{labels.work}</span>
        <button type="button" onClick={props.onParse}>{labels.parse}</button>
        <button type="button" onClick={() => void props.onPaste()}>{labels.paste}</button>
        <button type="button" onClick={props.onCreateNew}>{labels.createNew}</button>
        <button type="button" className="ghost-button" onClick={props.onClear}>{labels.clear}</button>
      </div>
      <div className="toolbar-group">
        <span className="toolbar-label">{labels.saveGroup}</span>
        <button type="button" onClick={props.onSave}>{labels.save}</button>
        <button type="button" onClick={props.onSaveAs}>{labels.saveAs}</button>
      </div>
      <div className="toolbar-group">
        <span className="toolbar-label">{labels.helpGroup}</span>
        <button type="button" className="secondary-button" onClick={props.onHelp}>{labels.help}</button>
        <button type="button" className="secondary-button" onClick={props.onWiki}>{labels.wiki}</button>
      </div>
    </div>
  );
}
