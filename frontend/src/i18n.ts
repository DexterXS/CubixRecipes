import { AppTab, PanelId, UiLanguage } from './types';

type TranslationTree = Record<string, string | TranslationTree>;

const translations: Record<UiLanguage, TranslationTree> = {
  ru: {
    app: {
      name: 'CubixRecipes',
      title: 'Редактор рецептов',
      subtitle: 'Гибкое рабочее пространство для парсинга, редактирования и отладки рецептов.',
      language: 'Язык',
      view: 'Вид',
      resetLayout: 'Сбросить раскладку',
      showAllPanels: 'Показать все панели',
      hidePanel: 'Скрыть панель',
      move: 'Переместить',
      moveUp: 'Выше',
      moveDown: 'Ниже',
      movePrevZone: 'Влево',
      moveNextZone: 'Вправо',
      zone: 'Зона',
      restoreDefault: 'Вернуть layout по умолчанию',
      file: 'Файл',
      uid: 'UID',
      source: 'Источник',
      unsaved: 'ещё не сохранён'
    },
    toolbar: {
      work: 'Работа',
      saveGroup: 'Сохранение',
      helpGroup: 'Помощь',
      parse: 'Вставить',
      paste: 'Вставить из буфера',
      new: 'Создать новый',
      clear: 'Очистить',
      save: 'Сохранить',
      saveAs: 'Сохранить как',
      help: 'Справка',
      wiki: 'Вики'
    },
    tabs: {
      editor: 'Редактор',
      preview: 'Предпросмотр',
      diagnostics: 'Диагностика',
      raw: 'Raw'
    },
    panel: {
      input: 'Входной рецепт',
      output: 'Результат',
      grid: 'Сетка рецепта',
      info: 'Информация о рецепте',
      debug: 'Быстрый debug',
      settings: 'Настройки',
      diagnostics: 'Диагностика',
      preview: 'Предпросмотр',
      raw: 'Сырые данные'
    },
    status: {
      ready: 'Готово',
      parsing: 'Парсинг...',
      loaded: 'Рецепт загружен',
      parseError: 'Ошибка парсинга',
      saved: 'Рецепт сохранён',
      saveError: 'Ошибка сохранения',
      saveAsCancelled: 'Сохранение как отменено',
      creating: 'Создаём шаблон...',
      created: 'Создан новый шаблон рецепта',
      cleared: 'Интерфейс очищен',
      docsOpened: 'Открыта документация',
      status: 'Статус',
      type: 'Тип',
      size: 'Размер',
      saveState: 'Сохранение',
      icons: 'Иконки',
      mode: 'Режим',
      uiSaved: 'UI-настройки сохранены'
    },
    fields: {
      sourceText: 'Исходный текст рецепта',
      strictBinding: 'Жёсткая привязка',
      metaMode: 'Режим меты',
      displayMode: 'Режим отображения',
      density: 'Плотность UI',
      editorMode: 'Режим редактора',
      rawOutput: 'Raw output',
      displayName: 'Display name',
      rawId: 'Raw id',
      iconStatus: 'Статус иконки',
      strategy: 'Стратегия',
      sourceFile: 'Файл рецепта',
      parsedCells: 'Заполненные ячейки',
      nullCells: 'Пустые ячейки',
      warnings: 'Предупреждения',
      saveStatus: 'Статус сохранения',
      outputState: 'Состояние output',
      lastApiStatus: 'Последний API статус',
      lastParseResult: 'Последний parse result',
      outputResolved: 'Output resolved',
      iconFound: 'Иконка найдена',
      configSources: 'Источники конфига',
      originPath: 'Исходный путь',
      visiblePanels: 'Панели'
    },
    values: {
      unresolved: 'не разрешено',
      placeholder: 'placeholder',
      yes: 'да',
      no: 'нет',
      resolved: 'разрешён',
      unresolvedShort: 'не разрешён',
      synchronized: 'Синхронизировано',
      draft: 'Черновик',
      reset: 'Сброшено',
      unsavedChanges: 'Есть несохранённые изменения',
      saved: 'Сохранено',
      error: 'Ошибка',
      idle: 'ожидание',
      pending: 'в процессе',
      ok: 'ok'
    },
    help: {
      title: 'Справка',
      close: 'Закрыть',
      items: [
        'Вставьте `recipes.addShaped(...)` или `mods.avaritia.ExtremeCrafting.addShaped(...)` в верхнее поле.',
        'Кнопка «Вставить» отправляет текст в backend `/api/parse` и заполняет сетку рецепта.',
        'Блок «Результат» показывает результат крафта и позволяет редактировать raw item id перед сохранением.',
        '«Сохранить» обновляет исходный `.zs` файл для уже существующего рецепта.',
        '«Сохранить как» добавляет текущий рецепт в другой `.zs` файл через backend save-as endpoint.',
        'Через меню «Вид» можно скрывать, возвращать и переставлять панели.'
      ]
    },
    parseModes: {
      strict: 'Строгая мета',
      wildcard: 'Учитывать *',
      ignore: 'Игнорировать мету'
    },
    zones: {
      topLeft: 'Слева сверху',
      topRight: 'Справа сверху',
      bottom: 'Основная зона',
      sidebar: 'Правая колонка'
    }
  },
  en: {
    app: {
      name: 'CubixRecipes',
      title: 'Recipe Editor',
      subtitle: 'Flexible workspace for parsing, editing and debugging recipes.',
      language: 'Language',
      view: 'View',
      resetLayout: 'Reset layout',
      showAllPanels: 'Show all panels',
      hidePanel: 'Hide panel',
      move: 'Move',
      moveUp: 'Up',
      moveDown: 'Down',
      movePrevZone: 'Left',
      moveNextZone: 'Right',
      zone: 'Zone',
      restoreDefault: 'Restore default layout',
      file: 'File',
      uid: 'UID',
      source: 'Source',
      unsaved: 'not saved yet'
    },
    toolbar: {
      work: 'Work',
      saveGroup: 'Save',
      helpGroup: 'Help',
      parse: 'Parse',
      paste: 'Paste from clipboard',
      new: 'Create New',
      clear: 'Clear',
      save: 'Save',
      saveAs: 'Save As',
      help: 'Help',
      wiki: 'Wiki'
    },
    tabs: {
      editor: 'Editor',
      preview: 'Preview',
      diagnostics: 'Diagnostics',
      raw: 'Raw'
    },
    panel: {
      input: 'Input Text',
      output: 'Output',
      grid: 'Input Grid',
      info: 'Recipe Info',
      debug: 'Quick Debug',
      settings: 'Settings',
      diagnostics: 'Diagnostics',
      preview: 'Preview',
      raw: 'Raw Data'
    },
    status: {
      ready: 'Ready',
      parsing: 'Parsing...',
      loaded: 'Recipe loaded',
      parseError: 'Parse error',
      saved: 'Recipe saved',
      saveError: 'Save error',
      saveAsCancelled: 'Save As cancelled',
      creating: 'Creating template...',
      created: 'New recipe template created',
      cleared: 'Workspace cleared',
      docsOpened: 'Documentation opened',
      status: 'Status',
      type: 'Type',
      size: 'Size',
      saveState: 'Save',
      icons: 'Icons',
      mode: 'Mode',
      uiSaved: 'UI settings saved'
    },
    fields: {
      sourceText: 'Recipe source text',
      strictBinding: 'Strict binding',
      metaMode: 'Meta mode',
      displayMode: 'Display mode',
      density: 'UI density',
      editorMode: 'Editor mode',
      rawOutput: 'Raw output',
      displayName: 'Display name',
      rawId: 'Raw id',
      iconStatus: 'Icon status',
      strategy: 'Strategy',
      sourceFile: 'Source file',
      parsedCells: 'Parsed cells',
      nullCells: 'Null cells',
      warnings: 'Warnings',
      saveStatus: 'Save status',
      outputState: 'Output state',
      lastApiStatus: 'Last API status',
      lastParseResult: 'Last parse result',
      outputResolved: 'Output resolved',
      iconFound: 'Icon found',
      configSources: 'Config sources',
      originPath: 'Origin path',
      visiblePanels: 'Panels'
    },
    values: {
      unresolved: 'unresolved',
      placeholder: 'placeholder',
      yes: 'yes',
      no: 'no',
      resolved: 'resolved',
      unresolvedShort: 'unresolved',
      synchronized: 'Synchronized',
      draft: 'Draft',
      reset: 'Reset',
      unsavedChanges: 'Unsaved changes',
      saved: 'Saved',
      error: 'Error',
      idle: 'idle',
      pending: 'pending',
      ok: 'ok'
    },
    help: {
      title: 'Help',
      close: 'Close',
      items: [
        'Paste `recipes.addShaped(...)` or `mods.avaritia.ExtremeCrafting.addShaped(...)` into the input panel.',
        'The parse button sends text to backend `/api/parse` and fills the recipe grid.',
        'The output panel shows the crafting result and lets you edit raw item id before saving.',
        '`Save` updates an existing `.zs` recipe block.',
        '`Save As` appends the current recipe to another `.zs` file.',
        'Use the View menu to hide, restore and rearrange panels.'
      ]
    },
    parseModes: {
      strict: 'Strict meta',
      wildcard: 'Allow *',
      ignore: 'Ignore meta'
    },
    zones: {
      topLeft: 'Top left',
      topRight: 'Top right',
      bottom: 'Main area',
      sidebar: 'Right sidebar'
    }
  }
};

export function createTranslator(language: UiLanguage) {
  return (key: string): string => {
    const parts = key.split('.');
    let node: string | TranslationTree = translations[language];
    for (const part of parts) {
      if (typeof node !== 'object' || node === null || !(part in node)) {
        return key;
      }
      node = node[part] as string | TranslationTree;
    }
    return typeof node === 'string' ? node : key;
  };
}

export function getHelpItems(language: UiLanguage): string[] {
  return (translations[language].help as TranslationTree).items as unknown as string[];
}

export function getTabLabel(language: UiLanguage, tab: AppTab): string {
  const t = createTranslator(language);
  return t(`tabs.${tab}`);
}

export function getPanelLabel(language: UiLanguage, panelId: PanelId): string {
  const map: Record<PanelId, string> = {
    input: 'panel.input',
    output: 'panel.output',
    grid: 'panel.grid',
    info: 'panel.info',
    debug: 'panel.debug',
    settings: 'panel.settings',
    diagnostics: 'panel.diagnostics',
    preview: 'panel.preview',
    raw: 'panel.raw'
  };
  const t = createTranslator(language);
  return t(map[panelId]);
}
