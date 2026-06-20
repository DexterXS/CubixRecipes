export type NbtScalarType = 'byte' | 'short' | 'int' | 'long' | 'float' | 'double' | 'string' | 'byte_array' | 'int_array' | 'long_array';
export type NbtNodeType = NbtScalarType | 'list' | 'compound';
export type NbtScalarNode = { kind: 'scalar'; value: string; scalarType: NbtScalarType };
export type NbtListNode = { kind: 'list'; items: NbtNode[] };
export type NbtCompoundNode = { kind: 'compound'; entries: { key: string; value: NbtNode }[] };
export type NbtNode = NbtScalarNode | NbtListNode | NbtCompoundNode;

export const nbtScalarTypes: NbtScalarType[] = ['byte', 'short', 'int', 'long', 'float', 'double', 'string', 'byte_array', 'int_array', 'long_array'];

const nbtNodeTypeOptions: NbtNodeType[] = [...nbtScalarTypes, 'list', 'compound'];

interface Props {
  root: NbtCompoundNode;
  collapsedPaths: Record<string, boolean>;
  labelPrefix?: string;
  emptyText?: string;
  onChange: (root: NbtCompoundNode) => void;
  onCollapsedPathsChange: (paths: Record<string, boolean>) => void;
}

export function defaultNodeForType(type: NbtNodeType): NbtNode {
  if (type === 'compound') return { kind: 'compound', entries: [] };
  if (type === 'list') return { kind: 'list', items: [] };
  return { kind: 'scalar', value: '', scalarType: type };
}

function nodeType(node: NbtNode): NbtNodeType {
  if (node.kind === 'compound') return 'compound';
  if (node.kind === 'list') return 'list';
  return node.scalarType;
}

function normalizeNodeTypeChange(nextType: NbtNodeType, current: NbtNode): NbtNode {
  if (nextType === 'compound') {
    return current.kind === 'compound' ? current : { kind: 'compound', entries: [] };
  }
  if (nextType === 'list') {
    return current.kind === 'list' ? current : { kind: 'list', items: [] };
  }
  if (current.kind === 'scalar') {
    return { ...current, scalarType: nextType };
  }
  return { kind: 'scalar', value: '', scalarType: nextType };
}

export function NbtTreeEditor({
  root,
  collapsedPaths,
  labelPrefix = 'nbt',
  emptyText = 'Добавьте NBT поле, объект или список.',
  onChange,
  onCollapsedPathsChange
}: Props) {
  function setNbtPathCollapsed(path: string, collapsed: boolean) {
    onCollapsedPathsChange({ ...collapsedPaths, [path]: collapsed });
  }

  function updateRootEntry(index: number, updater: (entry: NbtCompoundNode['entries'][number]) => NbtCompoundNode['entries'][number]) {
    onChange({
      ...root,
      entries: root.entries.map((entry, entryIndex) => (entryIndex === index ? updater(entry) : entry))
    });
  }

  function addRootEntry(type: NbtNodeType = 'int') {
    onChange({
      ...root,
      entries: [...root.entries, { key: '', value: defaultNodeForType(type) }]
    });
  }

  function renderNodeEditor(node: NbtNode, path: string, onNodeChange: (nextNode: NbtNode) => void) {
    const currentType = nodeType(node);
    const isCollapsed = collapsedPaths[path] ?? false;

    if (node.kind === 'scalar') {
      return (
        <div className="nbt-scalar-row">
          <input aria-label={`${labelPrefix}-value-${path}`} type="text" value={node.value} placeholder="значение" onChange={(event) => onNodeChange({ ...node, value: event.target.value })} />
          <select aria-label={`${labelPrefix}-type-${path}`} value={currentType} onChange={(event) => onNodeChange(normalizeNodeTypeChange(event.target.value as NbtNodeType, node))}>
            {nbtNodeTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
      );
    }

    if (node.kind === 'compound') {
      return (
        <div className="nbt-node-card nbt-node-compound">
          <div className="nbt-node-head">
            <button type="button" className="ghost-button nbt-collapse-button" aria-label={`toggle-${labelPrefix}-${path}`} onClick={() => setNbtPathCollapsed(path, !isCollapsed)}>{isCollapsed ? 'Развернуть' : 'Свернуть'}</button>
            <select aria-label={`${labelPrefix}-type-${path}`} value={currentType} onChange={(event) => onNodeChange(normalizeNodeTypeChange(event.target.value as NbtNodeType, node))}>
              {nbtNodeTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <button type="button" className="ghost-button" aria-label={`add-${labelPrefix}-child-${path}`} onClick={() => onNodeChange({ ...node, entries: [...node.entries, { key: '', value: defaultNodeForType('int') }] })}>Поле</button>
            <button type="button" className="ghost-button" aria-label={`add-${labelPrefix}-object-${path}`} onClick={() => onNodeChange({ ...node, entries: [...node.entries, { key: '', value: defaultNodeForType('compound') }] })}>Объект</button>
            <button type="button" className="ghost-button" aria-label={`add-${labelPrefix}-list-${path}`} onClick={() => onNodeChange({ ...node, entries: [...node.entries, { key: '', value: defaultNodeForType('list') }] })}>Список</button>
          </div>
          {!isCollapsed ? (
            <div className="nbt-children">
              {node.entries.map((entry, index) => (
                <div key={`${path}.${index}`} className="nbt-tree-row">
                  <input aria-label={`${labelPrefix}-key-${path}-${index}`} type="text" value={entry.key} placeholder="ключ" onChange={(event) => onNodeChange({ ...node, entries: node.entries.map((nodeEntry, nodeIndex) => nodeIndex === index ? { ...nodeEntry, key: event.target.value } : nodeEntry) })} />
                  {renderNodeEditor(entry.value, `${path}.${index}`, (nextValue) => onNodeChange({
                    ...node,
                    entries: node.entries.map((nodeEntry, nodeIndex) => nodeIndex === index ? { ...nodeEntry, value: nextValue } : nodeEntry)
                  }))}
                  <button type="button" className="ghost-button danger-lite-button" aria-label={`delete-${labelPrefix}-child-${path}-${index}`} onClick={() => onNodeChange({ ...node, entries: node.entries.filter((_, nodeIndex) => nodeIndex !== index) })}>Удалить</button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    return (
      <div className="nbt-node-card nbt-node-list">
        <div className="nbt-node-head">
          <button type="button" className="ghost-button nbt-collapse-button" aria-label={`toggle-${labelPrefix}-${path}`} onClick={() => setNbtPathCollapsed(path, !isCollapsed)}>{isCollapsed ? 'Развернуть' : 'Свернуть'}</button>
          <select aria-label={`${labelPrefix}-type-${path}`} value={currentType} onChange={(event) => onNodeChange(normalizeNodeTypeChange(event.target.value as NbtNodeType, node))}>
            {nbtNodeTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button type="button" className="ghost-button" aria-label={`add-${labelPrefix}-item-${path}`} onClick={() => onNodeChange({ ...node, items: [...node.items, defaultNodeForType('int')] })}>Элемент</button>
          <button type="button" className="ghost-button" aria-label={`add-${labelPrefix}-object-item-${path}`} onClick={() => onNodeChange({ ...node, items: [...node.items, defaultNodeForType('compound')] })}>Объект</button>
          <button type="button" className="ghost-button" aria-label={`add-${labelPrefix}-list-item-${path}`} onClick={() => onNodeChange({ ...node, items: [...node.items, defaultNodeForType('list')] })}>Список</button>
        </div>
        {!isCollapsed ? (
          <div className="nbt-children">
            {node.items.map((item, index) => (
              <div key={`${path}.${index}`} className="nbt-tree-row nbt-list-row">
                <span className="nbt-list-index">[{index}]</span>
                {renderNodeEditor(item, `${path}.${index}`, (nextNode) => onNodeChange({
                  ...node,
                  items: node.items.map((value, valueIndex) => valueIndex === index ? nextNode : value)
                }))}
                <button type="button" className="ghost-button danger-lite-button" aria-label={`delete-${labelPrefix}-item-${path}-${index}`} onClick={() => onNodeChange({ ...node, items: node.items.filter((_, valueIndex) => valueIndex !== index) })}>Удалить</button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="nbt-editor-shell">
      <div className="nbt-toolbar">
        <button type="button" className="secondary-button" aria-label={`add-${labelPrefix}-field`} onClick={() => addRootEntry('int')}>Поле</button>
        <button type="button" className="secondary-button" aria-label={`add-${labelPrefix}-object`} onClick={() => addRootEntry('compound')}>Объект</button>
        <button type="button" className="secondary-button" aria-label={`add-${labelPrefix}-list`} onClick={() => addRootEntry('list')}>Список</button>
      </div>
      {root.entries.length ? (
        <div className="nbt-tree-list" aria-label={`${labelPrefix}-editor-list`}>
          {root.entries.map((entry, index) => (
            <div key={`root-entry-${index}`} className="nbt-tree-row nbt-root-row">
              <input aria-label={`${labelPrefix}-key-${index}`} type="text" value={entry.key} placeholder="ключ" onChange={(event) => updateRootEntry(index, (current) => ({ ...current, key: event.target.value }))} />
              {renderNodeEditor(entry.value, `root.${index}`, (nextNode) => updateRootEntry(index, (current) => ({ ...current, value: nextNode })))}
              <button type="button" className="ghost-button danger-lite-button" aria-label={`delete-${labelPrefix}-root-${index}`} onClick={() => onChange({ ...root, entries: root.entries.filter((_, entryIndex) => entryIndex !== index) })}>Удалить</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="nbt-empty-state">{emptyText}</div>
      )}
    </div>
  );
}
