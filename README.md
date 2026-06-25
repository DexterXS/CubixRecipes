# CubixRecipes

CubixRecipes — локальное русскоязычное веб-приложение для парсинга, поиска, редактирования и сохранения рецептов CraftTweaker/MineTweaker/Avaritia, а также для базового разрешения иконок и названий предметов из ресурсов модов.

## Возможности
- Парсинг `recipes.addShaped(...)` и `mods.avaritia.ExtremeCrafting.addShaped(...)`, включая как матрицу `[[...]]`, так и строковый pattern+key синтаксис.
- Поддержка `null`, meta, wildcard `*`, legacy и 1.12 name-синтаксиса.
- Clipboard/parser now also normalizes literal escaped whitespace sequences like `\n` and `\t`, so recipes pasted from chats/forums parse correctly.
- The technical panel includes a step-by-step wipe update window for itempanel CSV, post-line `itempanel.json` SNBT data, mod icon ZIPs, atlas generation, an explicit merge action, and merged CSV inspection.
- NEI now prefers a backend combined item catalog built from `itempanel.csv`, `itempanel.json` SNBT tags, and icon availability; NBT variants are exposed as `.withTag(...)` item entries and open as populated NBT trees in item editors.
- Входное поле теперь автоматически парсит вставленный или вручную введённый `addShaped(...)` текст, а отдельная кнопка `Парсить` запускает тот же сценарий вручную.
- При редактировании и сохранении обычных shaped-рецептов backend автоматически обрезает пустую рамку, пересчитывает размер сетки и сохраняет только реально используемые клетки; extreme-рецепты стабильно остаются 9×9.
- Если backend недоступен, поле ввода показывает явное inline-сообщение с двумя адресами: локальный `/api` frontend и текущий `VITE_BACKEND_TARGET` для dev proxy, чтобы не путались frontend-port и backend-port.
- Frontend теперь автоматически повторяет загрузку UI-настроек после временного старта backend, а control panel поднимает frontend только после ответа backend API, чтобы избежать ложного offline-состояния и стартового proxy spam.
- Поиск рецептов по output item id в локальных `.zs` файлах.
- Редактируемая сетка рецепта во frontend и отдельный блок отображения/редактирования output item.
- Сетка рецепта в icon-режиме показывает иконки по каждой ячейке (если resolver их нашёл), при наведении отображает русское имя из `itempanel.csv` по ключу предмета и meta.
- Клик по иконке в output/ячейке открывает отдельное всплывающее окно редактирования крафта с кнопками `Очистить`, `Скопировать`, `Вставить`, `Применить` для работы именно с исходным форматом `addShaped(...)`.
- Основная Admin Panel (`python admin_panel.py` или `CubixRecipes_Admin.exe`) для запуска backend/frontend и пересборки itempanel atlas.
- Базовый индексатор ресурсов и resolver со стратегиями и `confidence`.
- Индексация иконок теперь умеет читать `mods_json/*.json` (деревья jar/модов), чтобы находить текстуры предметов даже без прямого обхода архива в момент скана.
- Endpoint `/api/icons/{icon_asset_id}` теперь отдает реальный `image/png` бинарник из файла или jar-архива, а frontend корректно проигрывает sprite-анимации для текстур с `.png.mcmeta`.
- **Мультисерверность**: поддержка нескольких серверов (с дефолтным HiTech сервером) с графическим выбором серверов после авторизации. Каждый сервер полностью изолирован и хранит свои скрипты, задачи, черновики, OreDict, атласы и ассеты под `.cubixrecipes_admin/servers/{server_id}/`.
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

Required auth/deploy env:
```bash
DATABASE_URL=postgresql://...
DATABASE_PRIVATE_URL=postgresql://... # optional Railway fallback if DATABASE_URL is not injected
DATABASE_PUBLIC_URL=postgresql://... # optional Railway fallback
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
AUTH_SESSION_SECRET=...
APP_PUBLIC_URL=https://your-backend.example
FRONTEND_PUBLIC_URL=https://your-frontend.example
ROOT_ADMIN_EMAIL=root.user76@gmail.com
AUTH_COOKIE_SAMESITE=none
AUTH_COOKIE_SECURE=true
CUBIXRECIPES_DATA_DIR=/data # optional; backend also accepts Railway volume mount env
```

If frontend and backend are separate Railway services, set the frontend build variable too:
```bash
VITE_API_BASE=https://your-backend.example/api
```

`APP_PUBLIC_URL` must use the same backend host as `VITE_API_BASE`; otherwise Google can complete the callback on one Railway domain while the frontend checks `/api/auth/me` on another domain and the session cookie will not match. `GOOGLE_REDIRECT_URI` can override the callback URL only when that exact host is also the API host used by the frontend.

For Railway persistent backend files, attach a volume to the backend service at `/data`. When `CUBIXRECIPES_DATA_DIR=/data` or Railway exposes a volume mount env, the backend stores `cubixrecipes.config.json`, default `.zs` scripts, `.zs` backups, mod icon uploads/atlases, shared recipe draft templates, and backend custom items under `/data`. Custom items use `.cubixrecipes_admin/custom_items` and are separate from cloud `.zs` scripts.

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
- Для локального управления можно запустить основную панель `python admin_panel.py` из корня проекта или готовый `CubixRecipes_Admin.exe`: откроется PySide-панель с карточками Backend/Frontend, встроенными консолями, API-индикатором, кнопкой освобождения порта `:8000` и действием `Rebuild Atlas`. `Rebuild Atlas` пересобирает `frontend/public/itempanel-atlas.json` и `frontend/public/itempanel-atlas.png` из корневых `itempanel.csv` и `itempanel_icons`, показывая progress/status прямо в панели. Старый `start-dev.py` оставлен только как dev/legacy-вариант панели.


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
