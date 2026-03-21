interface ActionToolbarProps {
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
  return (
    <div className="action-toolbar sticky-toolbar">
      <div className="toolbar-group">
        <span className="toolbar-label">Работа</span>
        <button type="button" onClick={props.onParse}>Вставить</button>
        <button type="button" onClick={() => void props.onPaste()}>Вставить из буфера</button>
        <button type="button" onClick={props.onCreateNew}>Создать новый</button>
        <button type="button" className="ghost-button" onClick={props.onClear}>Очистить</button>
      </div>
      <div className="toolbar-group">
        <span className="toolbar-label">Сохранение</span>
        <button type="button" onClick={props.onSave}>Сохранить</button>
        <button type="button" onClick={props.onSaveAs}>Сохранить как</button>
      </div>
      <div className="toolbar-group">
        <span className="toolbar-label">Помощь</span>
        <button type="button" className="secondary-button" onClick={props.onHelp}>Справка</button>
        <button type="button" className="secondary-button" onClick={props.onWiki}>Вики</button>
      </div>
    </div>
  );
}
