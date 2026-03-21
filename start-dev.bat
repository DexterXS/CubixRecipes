@echo off
setlocal

set "ROOT_DIR=%~dp0"

echo Запускаю CubixRecipes в двух отдельных окнах...

echo [1/2] Backend
start "CubixRecipes Backend" cmd /k "cd /d "%ROOT_DIR%backend" && if exist .venv\Scripts\activate.bat (call .venv\Scripts\activate.bat && uvicorn app.main:app --reload) else (echo [WARN] backend\\.venv не найден. Пытаюсь запустить через системный Python. && python -m uvicorn app.main:app --reload)"

echo [2/2] Frontend
start "CubixRecipes Frontend" cmd /k "cd /d "%ROOT_DIR%frontend" && npm run dev"

echo Готово: backend и frontend открыты в отдельных консолях.
pause
