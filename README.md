# CubixRecipes

CubixRecipes — локальное русскоязычное веб-приложение для парсинга, поиска, редактирования и сохранения рецептов CraftTweaker/MineTweaker/Avaritia, а также для базового разрешения иконок и названий предметов из ресурсов модов.

## Возможности
- Парсинг `recipes.addShaped(...)` и `mods.avaritia.ExtremeCrafting.addShaped(...)`, включая как матрицу `[[...]]`, так и строковый pattern+key синтаксис.
- Поддержка `null`, meta, wildcard `*`, legacy и 1.12 name-синтаксиса.
- Clipboard/parser now also normalizes literal escaped whitespace sequences like `\n` and `\t`, so recipes pasted from chats/forums parse correctly.
- Входное поле теперь автоматически парсит вставленный или вручную введённый `addShaped(...)` текст, а отдельная кнопка `Парсить` запускает тот же сценарий вручную.
- При редактировании и сохранении обычных shaped-рецептов backend автоматически обрезает пустую рамку, пересчитывает размер сетки и сохраняет только реально используемые клетки; extreme-рецепты стабильно остаются 9×9.
- Если backend недоступен, поле ввода показывает явное inline-сообщение с двумя адресами: локальный `/api` frontend и текущий `VITE_BACKEND_TARGET` для dev proxy, чтобы не путались frontend-port и backend-port.
- Поиск рецептов по output item id в локальных `.zs` файлах.
- Редактируемая сетка рецепта во frontend и отдельный блок отображения/редактирования output item.
- Control Panel с вкладкой Settings для сохранения путей к `.zs`, модам, ассетам и дополнительным источникам.
- Базовый индексатор ресурсов и resolver со стратегиями и `confidence`.
- Документация и skill-система для дальнейшего развития.

## Архитектура
- `backend/app/parsers`: парсер рецептов и item query.
- `backend/app/storage`: индексирование `.zs`, replace/append операций.
- `backend/app/indexer`: сбор индекса ресурсов из директорий и архивов.
- `backend/app/resolver`: цепочка стратегий разрешения иконок/имён.
- `backend/app/services`: orchestration use-cases.
- `backend/app/api`: FastAPI endpoints.
- `backend/app/config`: сервис конфигурации project paths и валидации путей.
- `frontend/src`: React + Vite SPA с редактируемой сеткой и русским UI.
- `.agents/skills`: локальные повторно используемые workflow-инструкции.

## Установка
### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .[dev]
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

> Vite dev server проксирует запросы `/api` на адрес из `VITE_BACKEND_TARGET` (по умолчанию `http://127.0.0.1:8000`). Если порт frontend занят, Vite может автоматически подняться на `5174`, `5175` и т.д. — это не меняет backend target.

## Запуск
- Backend по умолчанию: `http://127.0.0.1:8000`
- Backend теперь приведён к совместимой типизации для Python 3.9+, поэтому Pydantic-схемы и dataclass-модели не зависят от union-нотации `|`.
- Frontend Vite: обычно `http://127.0.0.1:5173`, но если порт занят, Vite автоматически выберет следующий свободный порт
- Для локального управления можно запустить `python start-dev.py` из корня проекта: откроется Tkinter-панель с кнопками Start/Stop/Restart для backend и frontend и вкладками `Backend Console`, `Frontend Console`, `Debug`, `Settings` и `Action Log`. Во вкладке `Debug` можно запросить подробную сводку по активному config, сканированию `.zs`, индексации ассетов, resolver trace, parse diagnostics, ошибкам и missing links, а также отдельно запускать `Refresh Debug Info`, `Rescan Recipes`, `Rescan Assets` и `Clear Debug Log`. Дополнительно вкладка `Full Debug Log` показывает единый хронологический лог backend/frontend/API/UI с фильтрами по source/level, кнопками `Copy Full Log`, `Save Log To File`, `Clear Log`, `Auto-scroll`, `Test Debug Pipeline`, а также статусной строкой с точным URL/status/body ошибки при проблемах запроса. Режим `Verbose debug logging` сохраняется в общем конфиге. Во вкладке `Settings` можно задать `scripts_dir`, `mods_dir`, `assets_dir`, `recipe_db_path`, `extra_icon_sources` и `extra_recipe_sources`; они сохраняются в `cubixrecipes.config.json` и используются backend при следующем запуске. Backend и frontend запускаются прямо внутри программы без внешних окон, а их stdout/stderr выводится в отдельные вкладки. Текст во вкладках можно выделять и копировать, HTTP/HTTPS-ссылки открываются кликом, а вывод дополнительно очищается от ANSI-кодов и части проблемных символов терминала. Для backend панель теперь заранее проверяет, в каком Python установлен `uvicorn`, и если зависимостей нет, показывает понятную команду установки вместо немого падения процесса. Если frontend не стартует, причина ошибки остаётся видна во вкладке frontend; скрипт также проверяет наличие `frontend/package.json` и `frontend/node_modules` перед запуском.


## Разработка
1. Прочитайте `AGENTS.md`.
2. Проверьте существующие skills в `.agents/skills`.
3. Внесите изменение в соответствующий модуль без смешивания слоёв.
4. Обновите тесты, `CHANGELOG.md`, а при необходимости `README.md`, `WIKI.md` и skills.

## Структура проекта
- `backend/` — FastAPI backend и unit-тесты.
- `frontend/` — React UI и frontend tests.
- `.agents/skills/` — reusable workflow notes.
- `docs/` — дополнительная проектная документация при расширении.
- `WIKI.md` — пользовательская wiki по формату рецептов и режимам.

## Roadmap
- MVP: shaped/extreme shaped parsing, storage, search, editable grid, minimal resolver.
- v2: richer resource indexing, incremental scans, multiple recipe matches, overrides UI.
- v3: animated icons, advanced crafting tree, 3D preview, more recipe formats.
