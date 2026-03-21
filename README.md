# CubixRecipes

CubixRecipes — локальное русскоязычное веб-приложение для парсинга, поиска, редактирования и сохранения рецептов CraftTweaker/MineTweaker/Avaritia, а также для базового разрешения иконок и названий предметов из ресурсов модов.

## Возможности
- Парсинг `recipes.addShaped(...)` и `mods.avaritia.ExtremeCrafting.addShaped(...)`.
- Поддержка `null`, meta, wildcard `*`, legacy и 1.12 name-синтаксиса.
- Поиск рецептов по output item id в локальных `.zs` файлах.
- Редактируемая сетка рецепта во frontend.
- Базовый индексатор ресурсов и resolver со стратегиями и `confidence`.
- Документация и skill-система для дальнейшего развития.

## Архитектура
- `backend/app/parsers`: парсер рецептов и item query.
- `backend/app/storage`: индексирование `.zs`, replace/append операций.
- `backend/app/indexer`: сбор индекса ресурсов из директорий и архивов.
- `backend/app/resolver`: цепочка стратегий разрешения иконок/имён.
- `backend/app/services`: orchestration use-cases.
- `backend/app/api`: FastAPI endpoints.
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

## Запуск
- Backend по умолчанию: `http://127.0.0.1:8000`
- Frontend Vite: `http://127.0.0.1:5173`
- Для Windows можно запустить `start-dev.bat` из корня проекта: он откроет две отдельные консоли для backend и frontend. Скрипт ожидает, что зависимости уже установлены, а backend virtualenv находится в `backend/.venv`.

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
