interface ActionToolbarLabels {
  work: string;
  saveGroup: string;
  helpGroup: string;
  texturesGroup: string;
  parse: string;
  paste: string;
  createNew: string;
  clear: string;
  save: string;
  saveAs: string;
  help: string;
  wiki: string;
  loadAllTextures: string;
  texturesProgress: string;
  texturesEmpty: string;
}

interface TextureModSummary {
  modid: string;
  itemCount: number;
  completionText: string;
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
  onToggleTextureMods: () => void;
  textureModsOpen: boolean;
  textureModSummaries: TextureModSummary[];
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
      <div className="toolbar-group toolbar-group-textures">
        <span className="toolbar-label">{labels.texturesGroup}</span>
        <div className="toolbar-texture-wrap">
          <button type="button" className="secondary-button" aria-expanded={props.textureModsOpen} onClick={props.onToggleTextureMods}>{labels.loadAllTextures}</button>
          {props.textureModsOpen ? (
            <div className="toolbar-texture-dropdown" role="region" aria-label={labels.loadAllTextures}>
              {props.textureModSummaries.length ? (
                <ul className="toolbar-texture-list">
                  {props.textureModSummaries.map((summary) => (
                    <li key={summary.modid} className="toolbar-texture-item">
                      <strong>{summary.modid}</strong>
                      <span>{summary.itemCount}</span>
                      <span>{labels.texturesProgress}: {summary.completionText}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="toolbar-texture-empty">{labels.texturesEmpty}</p>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
