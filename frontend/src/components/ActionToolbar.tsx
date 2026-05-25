interface ActionToolbarLabels {
  save: string;
  saveAs: string;
}

interface ActionToolbarProps {
  labels: ActionToolbarLabels;
  onSave: () => void;
  onSaveAs: () => void;
}

export function ActionToolbar(props: ActionToolbarProps) {
  const { labels } = props;
  return (
    <div className="action-toolbar sticky-toolbar">
      <div className="toolbar-group toolbar-group-primary">
        <button type="button" onClick={props.onSave}>{labels.save}</button>
        <button type="button" onClick={props.onSaveAs}>{labels.saveAs}</button>
      </div>
    </div>
  );
}
