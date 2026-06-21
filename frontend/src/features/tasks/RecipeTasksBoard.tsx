import { type DragEvent, type FormEvent, type ReactNode, useEffect, useMemo, useState } from 'react';
import { Panel } from '../../components/Panel';
import { createRecipeTask, deleteRecipeTask, listRecipeTasks, listUsers, reorderRecipeTasks, updateRecipeTask, updateRecipeTaskBoardMode } from '../../services/api';
import { AuthUser, RecipeTask, RecipeTaskBoardMode, RecipeTaskPriority, RecipeTaskStatus } from '../../types';

const statuses: Array<{ id: RecipeTaskStatus; label: string }> = [
  { id: 'planned', label: 'Запланировано' },
  { id: 'in_progress', label: 'В процессе' },
  { id: 'review', label: 'На проверку' },
  { id: 'done', label: 'Готово' }
];

const priorityLabels: Record<RecipeTaskPriority, string> = {
  low: 'Низкий',
  normal: 'Обычный',
  high: 'Высокий',
  urgent: 'Срочный'
};

const priorityRank: Record<RecipeTaskPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3
};

const DEFAULT_TASK_TITLE = 'Новая задача';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RecipeTaskItemOption {
  raw: string;
  title: string;
  searchText: string;
}

export interface RecipeTaskPrefillItem {
  raw: string;
  title: string;
  nonce: number;
}

interface TaskFormState {
  itemRaw: string;
  itemTitle: string;
  itemSearchText: string;
  title: string;
  description: string;
  status: RecipeTaskStatus;
  priority: RecipeTaskPriority;
  estimatedDays: number;
  deadlineDate: string;
  assigneeEmail: string;
  helperEmailsText: string;
}

interface TaskUserOption {
  email: string;
  label: string;
  searchText: string;
}

interface RecipeTasksBoardProps {
  authUser: AuthUser;
  itemOptions: RecipeTaskItemOption[];
  prefillItem?: RecipeTaskPrefillItem | null;
  onOpenRecipe?: (raw: string) => void;
  renderItemIcon: (raw: string) => ReactNode;
  resolveItemTitle: (raw: string) => string;
}

function todayDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function daysUntilDeadline(deadlineDate: string, now = new Date()): number {
  if (!deadlineDate) return 0;
  const today = new Date(`${todayDateInputValue(now)}T00:00:00`);
  const deadline = new Date(`${deadlineDate}T00:00:00`);
  if (!Number.isFinite(today.getTime()) || !Number.isFinite(deadline.getTime())) return 0;
  return Math.max(0, Math.ceil((deadline.getTime() - today.getTime()) / DAY_MS));
}

function estimatedDaysForPayload(deadlineDate: string): number {
  return Math.max(1, Math.min(365, daysUntilDeadline(deadlineDate) || 1));
}

function emptyForm(currentItemRaw = '', currentItemTitle = '', authEmail = ''): TaskFormState {
  const itemTitle = currentItemTitle || currentItemRaw;
  return {
    itemRaw: currentItemRaw,
    itemTitle,
    itemSearchText: itemTitle || currentItemRaw,
    title: itemTitle || currentItemRaw || '',
    description: '',
    status: 'planned',
    priority: 'normal',
    estimatedDays: 1,
    deadlineDate: todayDateInputValue(),
    assigneeEmail: authEmail,
    helperEmailsText: ''
  };
}

function formFromTask(task: RecipeTask): TaskFormState {
  return {
    itemRaw: task.itemRaw,
    itemTitle: task.itemTitle,
    itemSearchText: task.itemTitle || task.itemRaw,
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority,
    estimatedDays: task.estimatedDays,
    deadlineDate: task.deadlineDate,
    assigneeEmail: task.assigneeEmail,
    helperEmailsText: task.helperEmails.join(', ')
  };
}

function helperEmailsFromText(value: string): string[] {
  const seen = new Set<string>();
  return value
    .replace(/,/g, '\n')
    .split('\n')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => {
      if (!item || seen.has(item)) return false;
      seen.add(item);
      return true;
    });
}

function payloadFromForm(form: TaskFormState) {
  const itemRaw = form.itemRaw.trim();
  const itemTitle = form.itemTitle.trim() || itemRaw;
  return {
    itemRaw,
    itemTitle,
    title: form.title.trim() || itemTitle || itemRaw || 'Задача',
    description: form.description.trim(),
    status: form.status,
    priority: form.priority,
    estimatedDays: estimatedDaysForPayload(form.deadlineDate),
    deadlineDate: form.deadlineDate,
    assigneeEmail: form.assigneeEmail.trim().toLowerCase(),
    helperEmails: helperEmailsFromText(form.helperEmailsText)
  };
}

function formatDateTime(value: number): string {
  return value ? new Date(value).toLocaleString() : '-';
}

function isOverdue(task: RecipeTask): boolean {
  if (!task.deadlineDate || task.status === 'done') return false;
  const deadline = new Date(`${task.deadlineDate}T23:59:59`);
  return Number.isFinite(deadline.getTime()) && deadline.getTime() < Date.now();
}

function looksLikeRawItem(value: string): boolean {
  return /^<[^>]+>(?:\.withTag\([\s\S]*\))?$/.test(value.trim());
}

function shouldAutoReplaceTitle(form: TaskFormState): boolean {
  const title = form.title.trim();
  return !title || title === DEFAULT_TASK_TITLE || title === form.itemRaw || title === form.itemTitle;
}

export function RecipeTasksBoard({ authUser, itemOptions, prefillItem, onOpenRecipe, renderItemIcon, resolveItemTitle }: RecipeTasksBoardProps) {
  const [tasks, setTasks] = useState<RecipeTask[]>([]);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [boardMode, setBoardMode] = useState<RecipeTaskBoardMode>('free');
  const [statusText, setStatusText] = useState('Загрузка...');
  const [isCreating, setIsCreating] = useState(false);
  const [createForm, setCreateForm] = useState<TaskFormState>(() => emptyForm('', '', authUser.email));
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<TaskFormState | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [activeItemPickerKey, setActiveItemPickerKey] = useState<string | null>(null);
  const [activeUserPickerKey, setActiveUserPickerKey] = useState<string | null>(null);

  const normalizedItemOptions = useMemo(() => {
    const unique = new Map<string, RecipeTaskItemOption>();
    itemOptions.forEach((option) => {
      const raw = option.raw.trim();
      if (!raw || unique.has(raw)) return;
      const title = option.title.trim() || raw;
      unique.set(raw, {
        raw,
        title,
        searchText: `${option.searchText} ${raw} ${title}`.toLowerCase()
      });
    });
    return [...unique.values()];
  }, [itemOptions]);

  const userOptions = useMemo<TaskUserOption[]>(() => {
    const byEmail = new Map<string, TaskUserOption>();
    const pushUser = (user: AuthUser) => {
      const email = user.email.trim().toLowerCase();
      if (!email || byEmail.has(email)) return;
      const label = user.name && user.name !== user.email ? `${user.name} (${email})` : email;
      byEmail.set(email, {
        email,
        label,
        searchText: `${email} ${user.name ?? ''}`.toLowerCase()
      });
    };
    pushUser(authUser);
    users.forEach(pushUser);
    return [...byEmail.values()].sort((left, right) => left.email.localeCompare(right.email));
  }, [authUser, users]);

  useEffect(() => {
    let cancelled = false;
    async function loadBoard() {
      setStatusText('Загрузка...');
      try {
        const [board, userPayload] = await Promise.all([listRecipeTasks(), listUsers()]);
        if (!cancelled) {
          setTasks(board.tasks);
          setBoardMode(board.boardMode);
          setUsers(userPayload.users);
          setStatusText(`Задач: ${board.tasks.length}`);
        }
      } catch (error) {
        if (!cancelled) {
          setStatusText(error instanceof Error ? error.message : String(error));
        }
      }
    }
    void loadBoard();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setCreateForm((current) => {
      if (current.itemRaw || current.title) return current;
      return emptyForm('', '', authUser.email);
    });
  }, [authUser.email]);

  useEffect(() => {
    if (!prefillItem?.raw) return;
    setCreateForm(emptyForm(prefillItem.raw, prefillItem.title, authUser.email));
    setActiveItemPickerKey(null);
    setIsCreating(true);
  }, [authUser.email, prefillItem?.nonce, prefillItem?.raw, prefillItem?.title]);

  function sortedTasksForStatus(status: RecipeTaskStatus): RecipeTask[] {
    const statusTasks = tasks.filter((task) => task.status === status);
    if (boardMode === 'priority') {
      return [...statusTasks].sort((left, right) => priorityRank[left.priority] - priorityRank[right.priority] || left.deadlineDate.localeCompare(right.deadlineDate) || left.sortOrder - right.sortOrder);
    }
    if (boardMode === 'deadline') {
      return [...statusTasks].sort((left, right) => (left.deadlineDate || '9999-12-31').localeCompare(right.deadlineDate || '9999-12-31') || priorityRank[left.priority] - priorityRank[right.priority]);
    }
    if (boardMode === 'created') {
      return [...statusTasks].sort((left, right) => left.createdAt - right.createdAt);
    }
    return [...statusTasks].sort((left, right) => left.sortOrder - right.sortOrder || right.updatedAt - left.updatedAt);
  }

  async function refreshBoard() {
    try {
      const board = await listRecipeTasks();
      setTasks(board.tasks);
      setBoardMode(board.boardMode);
      setStatusText(`Задач: ${board.tasks.length}`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    }
  }

  async function saveBoardMode(nextMode: RecipeTaskBoardMode) {
    setBoardMode(nextMode);
    try {
      const board = await updateRecipeTaskBoardMode(nextMode);
      setTasks(board.tasks);
      setBoardMode(board.boardMode);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    }
  }

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    if (!createForm.itemRaw.trim()) {
      setStatusText('Выберите предмет для задачи');
      return;
    }
    try {
      const payload = await createRecipeTask(payloadFromForm(createForm));
      setTasks((current) => [payload.task, ...current]);
      setCreateForm(emptyForm('', '', authUser.email));
      setIsCreating(false);
      setStatusText('Задача создана');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    }
  }

  async function submitEdit(task: RecipeTask, event: FormEvent) {
    event.preventDefault();
    const form = editForm ?? formFromTask(task);
    if (!form.itemRaw.trim()) {
      setStatusText('Выберите предмет для задачи');
      return;
    }
    try {
      const payload = await updateRecipeTask(task.id, payloadFromForm(form));
      setTasks((current) => current.map((item) => item.id === payload.task.id ? payload.task : item));
      setEditingTaskId(null);
      setEditForm(null);
      setStatusText('Задача обновлена');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    }
  }

  async function removeTask(task: RecipeTask) {
    try {
      await deleteRecipeTask(task.id);
      setTasks((current) => current.filter((item) => item.id !== task.id));
      if (editingTaskId === task.id) {
        setEditingTaskId(null);
        setEditForm(null);
      }
      setStatusText('Задача удалена');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    }
  }

  async function clearDoneTasks(doneTasks: RecipeTask[]) {
    if (!doneTasks.length) return;
    try {
      await Promise.all(doneTasks.map((task) => deleteRecipeTask(task.id)));
      const doneIds = new Set(doneTasks.map((task) => task.id));
      setTasks((current) => current.filter((task) => !doneIds.has(task.id)));
      if (editingTaskId && doneIds.has(editingTaskId)) {
        setEditingTaskId(null);
        setEditForm(null);
      }
      setStatusText(`Готовые задачи очищены: ${doneTasks.length}`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    }
  }

  function beginDrag(taskId: string) {
    setDraggedTaskId(taskId);
  }

  function allowDrop(event: DragEvent) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  async function dropTask(targetStatus: RecipeTaskStatus, beforeTaskId?: string) {
    if (!draggedTaskId) return;
    const dragged = tasks.find((task) => task.id === draggedTaskId);
    setDraggedTaskId(null);
    if (!dragged) return;

    if (boardMode !== 'free') {
      const previousTasks = tasks;
      const nextTasks = tasks.map((task) => task.id === dragged.id ? { ...task, status: targetStatus } : task);
      setTasks(nextTasks);
      try {
        const payload = await updateRecipeTask(dragged.id, { status: targetStatus });
        setTasks((current) => current.map((task) => task.id === payload.task.id ? payload.task : task));
      } catch (error) {
        setTasks(previousTasks);
        setStatusText(error instanceof Error ? error.message : String(error));
      }
      return;
    }

    const previousTasks = tasks;
    const nextByStatus = new Map<RecipeTaskStatus, RecipeTask[]>();
    statuses.forEach((status) => nextByStatus.set(status.id, sortedTasksForStatus(status.id).filter((task) => task.id !== dragged.id)));
    const targetList = nextByStatus.get(targetStatus) ?? [];
    const moved = { ...dragged, status: targetStatus };
    const beforeIndex = beforeTaskId ? targetList.findIndex((task) => task.id === beforeTaskId) : -1;
    if (beforeIndex >= 0) {
      targetList.splice(beforeIndex, 0, moved);
    } else {
      targetList.push(moved);
    }
    nextByStatus.set(targetStatus, targetList);
    const orderedTasks = statuses.flatMap((status) => (nextByStatus.get(status.id) ?? []).map((task, index) => ({ ...task, sortOrder: (index + 1) * 1000 })));
    setTasks(orderedTasks);
    try {
      const payload = await reorderRecipeTasks(orderedTasks.map((task) => ({ id: task.id, status: task.status, sortOrder: task.sortOrder })));
      setTasks(payload.tasks);
    } catch (error) {
      setTasks(previousTasks);
      setStatusText(error instanceof Error ? error.message : String(error));
    }
  }

  function updateCreateForm(patch: Partial<TaskFormState>) {
    setCreateForm((current) => ({ ...current, ...patch }));
  }

  function updateEditForm(patch: Partial<TaskFormState>) {
    setEditForm((current) => current ? { ...current, ...patch } : current);
  }

  function beginEditTask(task: RecipeTask) {
    setEditForm(formFromTask(task));
    setEditingTaskId(task.id);
    setActiveItemPickerKey(null);
  }

  function itemPatchFromSelection(form: TaskFormState, raw: string, title: string): Partial<TaskFormState> {
    const itemRaw = raw.trim();
    const itemTitle = (title || resolveItemTitle(itemRaw) || itemRaw).trim();
    return {
      itemRaw,
      itemTitle,
      itemSearchText: itemTitle || itemRaw,
      ...(shouldAutoReplaceTitle(form) ? { title: itemTitle || itemRaw } : {})
    };
  }

  function itemPatchFromSearchInput(form: TaskFormState, value: string): Partial<TaskFormState> {
    const trimmed = value.trim();
    if (!trimmed) {
      return {
        itemRaw: '',
        itemTitle: '',
        itemSearchText: value,
        ...(shouldAutoReplaceTitle(form) ? { title: '' } : {})
      };
    }
    if (looksLikeRawItem(trimmed)) {
      return {
        ...itemPatchFromSelection(form, trimmed, resolveItemTitle(trimmed)),
        itemSearchText: value
      };
    }
    return {
      itemRaw: '',
      itemTitle: '',
      itemSearchText: value,
      ...(shouldAutoReplaceTitle(form) ? { title: '' } : {})
    };
  }

  function getTaskItemSuggestions(form: TaskFormState): RecipeTaskItemOption[] {
    const query = form.itemSearchText.trim().toLowerCase();
    if (!query) return [];
    const result = normalizedItemOptions
      .filter((option) => option.searchText.includes(query))
      .sort((left, right) => {
        const leftExact = left.raw.toLowerCase() === query || left.title.toLowerCase() === query;
        const rightExact = right.raw.toLowerCase() === query || right.title.toLowerCase() === query;
        if (leftExact !== rightExact) return leftExact ? -1 : 1;
        return left.title.localeCompare(right.title);
      });
    return result.slice(0, 16);
  }

  function getUserSuggestions(query: string, excludedEmails: string[] = []): TaskUserOption[] {
    const normalizedQuery = query.trim().toLowerCase();
    const excluded = new Set(excludedEmails.map((email) => email.trim().toLowerCase()).filter(Boolean));
    return userOptions
      .filter((option) => !excluded.has(option.email))
      .filter((option) => !normalizedQuery || option.searchText.includes(normalizedQuery))
      .slice(0, 12);
  }

  function helperSearchTerm(value: string): string {
    const parts = value.replace(/\n/g, ',').split(',');
    return (parts[parts.length - 1] ?? '').trim();
  }

  function helperEmailsWithSelection(value: string, email: string): string {
    const normalizedEmail = email.trim().toLowerCase();
    const parts = value.replace(/\n/g, ',').split(',');
    parts[parts.length - 1] = normalizedEmail;
    const seen = new Set<string>();
    return parts
      .map((part) => part.trim().toLowerCase())
      .filter((part) => {
        if (!part || seen.has(part)) return false;
        seen.add(part);
        return true;
      })
      .join(', ');
  }

  function renderTaskForm(form: TaskFormState, pickerKey: string, onChange: (patch: Partial<TaskFormState>) => void, onSubmit: (event: FormEvent) => void, submitLabel: string, extraActions?: ReactNode) {
    const suggestions = activeItemPickerKey === pickerKey ? getTaskItemSuggestions(form) : [];
    const selectedItemTitle = form.itemTitle || (form.itemRaw ? resolveItemTitle(form.itemRaw) : '');
    const assigneePickerKey = `${pickerKey}-assignee`;
    const helpersPickerKey = `${pickerKey}-helpers`;
    const helperEmails = helperEmailsFromText(form.helperEmailsText);
    const assigneeSuggestions = activeUserPickerKey === assigneePickerKey ? getUserSuggestions(form.assigneeEmail) : [];
    const helperSuggestions = activeUserPickerKey === helpersPickerKey ? getUserSuggestions(helperSearchTerm(form.helperEmailsText), helperEmails) : [];
    const deadlineDays = daysUntilDeadline(form.deadlineDate);
    return (
      <form className="task-form" onSubmit={onSubmit}>
        <div className="task-form-grid">
          <label className="field-block task-item-field">
            <span>Предмет</span>
            <div className={`task-item-picker ${form.itemRaw ? 'has-item' : ''}`.trim()}>
              <span className="task-item-picker-icon" aria-hidden="true">{form.itemRaw ? renderItemIcon(form.itemRaw) : null}</span>
              <input
                aria-label="Предмет"
                value={form.itemSearchText}
                onFocus={() => setActiveItemPickerKey(pickerKey)}
                onChange={(event) => {
                  setActiveItemPickerKey(pickerKey);
                  onChange(itemPatchFromSearchInput(form, event.target.value));
                }}
                placeholder="Название, ID или <mod:item>"
                required
              />
            </div>
            {form.itemRaw ? <code className="task-selected-item-raw">{form.itemRaw}</code> : null}
            {selectedItemTitle && selectedItemTitle !== form.itemSearchText ? <small>{selectedItemTitle}</small> : null}
            {suggestions.length ? (
              <div className="suggestions-list task-item-suggestions" role="listbox" aria-label="task-item-suggestions">
                {suggestions.map((option) => (
                  <button
                    key={option.raw}
                    type="button"
                    className="suggestion-item suggestion-item-with-icon"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onChange(itemPatchFromSelection(form, option.raw, option.title));
                      setActiveItemPickerKey(null);
                    }}
                  >
                    <span className="suggestion-icon-slot" aria-hidden="true">{renderItemIcon(option.raw)}</span>
                    <div className="suggestion-content">
                      <strong>{option.title}</strong>
                      <span>{option.raw}</span>
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <label className="field-block"><span>Название</span><input value={form.title} onChange={(event) => onChange({ title: event.target.value })} /></label>
          <label className="field-block"><span>Приоритет</span><select value={form.priority} onChange={(event) => onChange({ priority: event.target.value as RecipeTaskPriority })}>{Object.entries(priorityLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
          <label className="field-block"><span>Статус</span><select value={form.status} onChange={(event) => onChange({ status: event.target.value as RecipeTaskStatus })}>{statuses.map((status) => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
          <label className="field-block task-user-field">
            <span>Ответственный</span>
            <input
              aria-label="Ответственный"
              value={form.assigneeEmail}
              onFocus={() => setActiveUserPickerKey(assigneePickerKey)}
              onChange={(event) => {
                setActiveUserPickerKey(assigneePickerKey);
                onChange({ assigneeEmail: event.target.value });
              }}
              placeholder="email или имя"
            />
            {assigneeSuggestions.length ? (
              <div className="suggestions-list task-user-suggestions" role="listbox" aria-label="task-assignee-suggestions">
                {assigneeSuggestions.map((option) => (
                  <button
                    key={option.email}
                    type="button"
                    className="suggestion-item"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onChange({ assigneeEmail: option.email });
                      setActiveUserPickerKey(null);
                    }}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.email}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <label className="field-block task-user-field">
            <span>Помощники</span>
            <input
              aria-label="Помощники"
              value={form.helperEmailsText}
              onFocus={() => setActiveUserPickerKey(helpersPickerKey)}
              onChange={(event) => {
                setActiveUserPickerKey(helpersPickerKey);
                onChange({ helperEmailsText: event.target.value });
              }}
              placeholder="имя или email"
            />
            {helperSuggestions.length ? (
              <div className="suggestions-list task-user-suggestions" role="listbox" aria-label="task-helper-suggestions">
                {helperSuggestions.map((option) => (
                  <button
                    key={option.email}
                    type="button"
                    className="suggestion-item"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onChange({ helperEmailsText: helperEmailsWithSelection(form.helperEmailsText, option.email) });
                      setActiveUserPickerKey(null);
                    }}
                  >
                    <strong>{option.label}</strong>
                    <span>{option.email}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </label>
          <div className="field-block"><span>Дней</span><output aria-label="Дней" className="task-days-counter">{deadlineDays}</output></div>
          <label className="field-block"><span>Дедлайн</span><input type="date" min={todayDateInputValue()} value={form.deadlineDate} onChange={(event) => onChange({ deadlineDate: event.target.value })} /></label>
        </div>
        <label className="field-block"><span>Описание</span><textarea value={form.description} onChange={(event) => onChange({ description: event.target.value })} /></label>
        <div className="inline-actions">
          <button type="submit" disabled={!form.itemRaw.trim()}>{submitLabel}</button>
          {extraActions}
        </div>
      </form>
    );
  }

  function renderTaskCard(task: RecipeTask) {
    const title = task.itemTitle || task.title || (task.itemRaw ? resolveItemTitle(task.itemRaw) : 'Задача');
    const expandedCard = Boolean(expanded[task.id]);
    return (
      <article
        key={task.id}
        className={`task-card priority-${task.priority} ${draggedTaskId === task.id ? 'is-dragging' : ''}`.trim()}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move';
          beginDrag(task.id);
        }}
        onDragOver={allowDrop}
        onDrop={(event) => {
          event.preventDefault();
          void dropTask(task.status, task.id);
        }}
      >
        <button type="button" className="task-card-summary" aria-expanded={expandedCard} aria-label={`task-card-${task.id}`} onClick={() => setExpanded((current) => ({ ...current, [task.id]: !current[task.id] }))}>
          <span className="task-icon-slot">{task.itemRaw ? renderItemIcon(task.itemRaw) : null}</span>
          <span className="task-card-main">
            <strong>{title}</strong>
            <span>{task.assigneeEmail || 'Без ответственного'}</span>
          </span>
          <span className={`task-priority priority-${task.priority}`}>{priorityLabels[task.priority]}</span>
          <span className={`task-deadline ${isOverdue(task) ? 'is-overdue' : ''}`}>{task.deadlineDate || `${task.estimatedDays} дн.`}</span>
        </button>
        {expandedCard ? (
          <div className="task-card-details">
            <p>{task.description || 'Описание не заполнено.'}</p>
            <div className="task-meta-grid">
              <div><span>Поставил</span><strong>{task.createdByEmail}</strong></div>
              <div><span>Создано</span><strong>{formatDateTime(task.createdAt)}</strong></div>
              <div><span>Помощники</span><strong>{task.helperEmails.length ? task.helperEmails.join(', ') : '-'}</strong></div>
              <div><span>На проверку</span><strong>{task.submittedByEmail || '-'}</strong></div>
              <div><span>Проверил</span><strong>{task.reviewedByEmail || '-'}</strong></div>
              <div><span>Утверждено</span><strong>{formatDateTime(task.approvedAt)}</strong></div>
            </div>
            <div className="inline-actions">
              <button type="button" className="secondary-button" disabled={!task.itemRaw} onClick={() => onOpenRecipe?.(task.itemRaw)}>Открыть рецепт</button>
              <button type="button" className="secondary-button" onClick={() => beginEditTask(task)}>Редактировать</button>
              <button type="button" className="ghost-button danger-lite-button" onClick={() => void removeTask(task)}>Удалить</button>
            </div>
          </div>
        ) : null}
      </article>
    );
  }

  function renderEditModal() {
    if (!editingTaskId || !editForm) return null;
    const task = tasks.find((item) => item.id === editingTaskId);
    if (!task) return null;
    const title = task.itemTitle || task.title || (task.itemRaw ? resolveItemTitle(task.itemRaw) : 'Задача');
    return (
      <div className="modal-backdrop" onMouseDown={() => {
        setEditingTaskId(null);
        setEditForm(null);
      }}>
        <div className="modal task-edit-modal" role="dialog" aria-modal="true" aria-label="Редактирование задачи" onMouseDown={(event) => event.stopPropagation()}>
          <div className="modal-header">
            <div>
              <h2>Редактирование задачи</h2>
              <span className="modal-subtitle">{title}</span>
            </div>
            <button type="button" className="ghost-button" onClick={() => {
              setEditingTaskId(null);
              setEditForm(null);
            }}>Закрыть</button>
          </div>
          <div className="settings-modal-body">
            {renderTaskForm(editForm, `edit-${task.id}`, updateEditForm, (event) => void submitEdit(task, event), 'Сохранить', (
              <>
                <button type="button" className="ghost-button" onClick={() => {
                  setEditingTaskId(null);
                  setEditForm(null);
                }}>Отмена</button>
                <button type="button" className="secondary-button" disabled={!task.itemRaw} onClick={() => {
                  setEditingTaskId(null);
                  setEditForm(null);
                  onOpenRecipe?.(task.itemRaw);
                }}>Открыть рецепт</button>
                <button type="button" className="ghost-button danger-lite-button" onClick={() => void removeTask(task)}>Удалить</button>
              </>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="tasks-workspace">
      <Panel title="Задачи" subtitle={statusText} className="tasks-panel">
        <div className="tasks-toolbar">
          <div className="inline-actions">
            <button type="button" onClick={() => {
              setCreateForm(emptyForm('', '', authUser.email));
              setActiveItemPickerKey(null);
              setIsCreating((value) => !value);
            }}>Новая задача</button>
            <button type="button" className="secondary-button" onClick={() => void refreshBoard()}>Обновить</button>
          </div>
          <label className="field-block task-mode-field">
            <span>Режим</span>
            <select value={boardMode} onChange={(event) => void saveBoardMode(event.target.value as RecipeTaskBoardMode)}>
              <option value="free">Свободный</option>
              <option value="priority">По приоритету</option>
              <option value="deadline">По дедлайну</option>
              <option value="created">По созданию</option>
            </select>
          </label>
        </div>
        {isCreating ? renderTaskForm(createForm, 'create', updateCreateForm, submitCreate, 'Создать', <button type="button" className="ghost-button" onClick={() => setIsCreating(false)}>Отмена</button>) : null}
        <div className="task-board" aria-label="recipe-tasks-board">
          {statuses.map((status) => {
            const columnTasks = sortedTasksForStatus(status.id);
            return (
              <section key={status.id} className="task-column" aria-label={`task-column-${status.id}`} onDragOver={allowDrop} onDrop={(event) => {
                event.preventDefault();
                void dropTask(status.id);
              }}>
                <div className="task-column-head">
                  <h3>{status.label}</h3>
                  {status.id === 'done' ? (
                    <button type="button" className="ghost-button task-clear-done-button" disabled={!columnTasks.length} onClick={() => void clearDoneTasks(columnTasks)}>Очистить все задачи</button>
                  ) : null}
                  <span>{columnTasks.length}</span>
                </div>
                <div className="task-column-list">
                  {columnTasks.map((task) => renderTaskCard(task))}
                  {!columnTasks.length ? <div className="task-empty-column">Пусто</div> : null}
                </div>
              </section>
            );
          })}
        </div>
        {renderEditModal()}
      </Panel>
    </div>
  );
}
