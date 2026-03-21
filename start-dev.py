# -*- coding: utf-8 -*-

from __future__ import annotations

import logging
import os
import subprocess
import sys
import tkinter as tk
from pathlib import Path
from tkinter import messagebox
from tkinter.scrolledtext import ScrolledText

WINDOWS_NEW_CONSOLE = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
POLL_INTERVAL_MS = 1000
RESTART_DELAY_MS = 500
RESTART_ALL_DELAY_MS = 700
LOG_FORMAT = "%(asctime)s | %(levelname)s | %(message)s"


class TkTextHandler(logging.Handler):
    def __init__(self, widget: ScrolledText) -> None:
        super().__init__()
        self.widget = widget
        self.setFormatter(logging.Formatter(LOG_FORMAT, datefmt="%H:%M:%S"))

    def emit(self, record: logging.LogRecord) -> None:
        message = self.format(record)

        def append() -> None:
            self.widget.configure(state=tk.NORMAL)
            self.widget.insert(tk.END, message + "\n")
            self.widget.see(tk.END)
            self.widget.configure(state=tk.DISABLED)

        self.widget.after(0, append)


class ProcessControllerApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("CubixRecipes Control Panel")
        self.root.geometry("700x520")
        self.root.resizable(False, False)

        self.root_dir = Path(__file__).resolve().parent
        self.backend_dir = self.root_dir / "backend"
        self.frontend_dir = self.root_dir / "frontend"

        self.backend_proc: subprocess.Popen[str] | None = None
        self.frontend_proc: subprocess.Popen[str] | None = None

        self.backend_status: tk.Label
        self.frontend_status: tk.Label
        self.log_output: ScrolledText
        self.logger = logging.getLogger("cubixrecipes.start_dev")
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False
        self._status_snapshot: tuple[bool, bool] | None = None

        self._create_widgets()
        self._configure_logging()
        self._log_environment_summary()
        self._update_status_labels()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _create_widgets(self) -> None:
        title = tk.Label(
            self.root,
            text="Управление CubixRecipes",
            font=("Arial", 14, "bold"),
        )
        title.pack(pady=10)

        self.backend_status = tk.Label(self.root, text="Backend: неизвестно", font=("Arial", 11))
        self.backend_status.pack(pady=5)

        backend_frame = tk.Frame(self.root)
        backend_frame.pack(pady=5)

        tk.Button(backend_frame, text="Start Backend", width=15, command=self.start_backend).pack(
            side=tk.LEFT,
            padx=5,
        )
        tk.Button(backend_frame, text="Stop Backend", width=15, command=self.stop_backend).pack(
            side=tk.LEFT,
            padx=5,
        )
        tk.Button(backend_frame, text="Restart Backend", width=15, command=self.restart_backend).pack(
            side=tk.LEFT,
            padx=5,
        )

        self.frontend_status = tk.Label(self.root, text="Frontend: неизвестно", font=("Arial", 11))
        self.frontend_status.pack(pady=10)

        frontend_frame = tk.Frame(self.root)
        frontend_frame.pack(pady=5)

        tk.Button(frontend_frame, text="Start Frontend", width=15, command=self.start_frontend).pack(
            side=tk.LEFT,
            padx=5,
        )
        tk.Button(frontend_frame, text="Stop Frontend", width=15, command=self.stop_frontend).pack(
            side=tk.LEFT,
            padx=5,
        )
        tk.Button(frontend_frame, text="Restart Frontend", width=15, command=self.restart_frontend).pack(
            side=tk.LEFT,
            padx=5,
        )

        global_frame = tk.Frame(self.root)
        global_frame.pack(pady=20)

        tk.Button(global_frame, text="Start All", width=15, command=self.start_all).pack(side=tk.LEFT, padx=5)
        tk.Button(global_frame, text="Stop All", width=15, command=self.stop_all).pack(side=tk.LEFT, padx=5)
        tk.Button(global_frame, text="Restart All", width=15, command=self.restart_all).pack(side=tk.LEFT, padx=5)

        hint = tk.Label(
            self.root,
            text="Лог ниже объясняет, что запускается/останавливается, почему это делается и какие процессы сейчас можно остановить.",
            font=("Arial", 9),
            wraplength=640,
            justify=tk.CENTER,
        )
        hint.pack(pady=(0, 10))

        log_frame = tk.Frame(self.root)
        log_frame.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0, 12))

        tk.Label(log_frame, text="Журнал действий", font=("Arial", 10, "bold")).pack(anchor="w")
        self.log_output = ScrolledText(log_frame, height=12, state=tk.DISABLED, font=("Consolas", 9))
        self.log_output.pack(fill=tk.BOTH, expand=True, pady=(6, 0))

    def _configure_logging(self) -> None:
        if self.logger.handlers:
            self.logger.handlers.clear()

        self.logger.addHandler(TkTextHandler(self.log_output))

    def _log_environment_summary(self) -> None:
        self.logger.info("Панель управления запущена. Корень проекта: %s", self.root_dir)
        self.logger.info(
            "Доступные действия: Start/Stop/Restart для backend, frontend и обоих сервисов сразу."
        )
        self.logger.info(
            "Остановить можно только процессы, которые были запущены этой панелью и всё ещё активны."
        )

    def is_running(self, proc: subprocess.Popen[str] | None) -> bool:
        return proc is not None and proc.poll() is None

    def _set_status_snapshot(self, backend_running: bool, frontend_running: bool) -> None:
        snapshot = (backend_running, frontend_running)
        if snapshot == self._status_snapshot:
            return

        if self._status_snapshot is not None:
            if backend_running != self._status_snapshot[0]:
                self.logger.info(
                    "Статус backend изменился: %s.",
                    "работает и может быть остановлен" if backend_running else "остановлен и сейчас нечего останавливать",
                )
            if frontend_running != self._status_snapshot[1]:
                self.logger.info(
                    "Статус frontend изменился: %s.",
                    "работает и может быть остановлен" if frontend_running else "остановлен и сейчас нечего останавливать",
                )

        self._status_snapshot = snapshot

    def _update_status_labels(self) -> None:
        backend_running = self.is_running(self.backend_proc)
        frontend_running = self.is_running(self.frontend_proc)

        backend_text = "Backend: работает" if backend_running else "Backend: остановлен"
        frontend_text = "Frontend: работает" if frontend_running else "Frontend: остановлен"

        self.backend_status.config(text=backend_text)
        self.frontend_status.config(text=frontend_text)
        self._set_status_snapshot(backend_running, frontend_running)
        self.root.after(POLL_INTERVAL_MS, self._update_status_labels)

    def _build_backend_command(self) -> tuple[list[str] | str, bool]:
        if os.name == "nt":
            venv_python = self.backend_dir / ".venv" / "Scripts" / "python.exe"
            if venv_python.exists():
                return [str(venv_python), "-m", "uvicorn", "app.main:app", "--reload"], False

            return "python -m uvicorn app.main:app --reload", True

        venv_python = self.backend_dir / ".venv" / "bin" / "python"
        if venv_python.exists():
            return [str(venv_python), "-m", "uvicorn", "app.main:app", "--reload"], False

        return [sys.executable, "-m", "uvicorn", "app.main:app", "--reload"], False

    def _build_frontend_command(self) -> tuple[list[str] | str, bool]:
        if os.name == "nt":
            return ["npm.cmd", "run", "dev"], False

        return ["npm", "run", "dev"], False

    def _creation_flags(self) -> int:
        return WINDOWS_NEW_CONSOLE if os.name == "nt" else 0

    def _show_missing_dir_error(self, name: str, directory: Path) -> None:
        self.logger.error("Запуск %s невозможен: не найдена папка %s", name, directory)
        messagebox.showerror("Ошибка", f"Папка {name} не найдена:\n{directory}")

    def _describe_command(self, command: list[str] | str) -> str:
        if isinstance(command, list):
            return " ".join(command)
        return command

    def _start_process(
        self,
        current_proc: subprocess.Popen[str] | None,
        directory: Path,
        command: list[str] | str,
        use_shell: bool,
        name: str,
    ) -> subprocess.Popen[str] | None:
        if self.is_running(current_proc):
            self.logger.info(
                "%s уже запущен, поэтому повторный старт пропущен. Этот процесс можно остановить кнопкой Stop %s.",
                name.capitalize(),
                name.capitalize(),
            )
            return current_proc

        if not directory.is_dir():
            self._show_missing_dir_error(name, directory)
            return None

        self.logger.info(
            "Запускаю %s, потому что был запрошен старт из панели. Рабочая папка: %s. Команда: %s",
            name,
            directory,
            self._describe_command(command),
        )
        try:
            proc = subprocess.Popen(
                command,
                cwd=directory,
                shell=use_shell,
                creationflags=self._creation_flags(),
            )
            self.logger.info(
                "%s успешно запущен (pid=%s). Теперь его можно остановить или перезапустить из панели.",
                name.capitalize(),
                proc.pid,
            )
            return proc
        except OSError as error:
            self.logger.exception("Не удалось запустить %s: %s", name, error)
            messagebox.showerror("Ошибка запуска", f"Не удалось запустить {name}:\n{error}")
            return None

    def start_backend(self) -> None:
        command, use_shell = self._build_backend_command()
        self.backend_proc = self._start_process(
            self.backend_proc,
            self.backend_dir,
            command,
            use_shell,
            "backend",
        )

    def start_frontend(self) -> None:
        command, use_shell = self._build_frontend_command()
        self.frontend_proc = self._start_process(
            self.frontend_proc,
            self.frontend_dir,
            command,
            use_shell,
            "frontend",
        )

    def _stop_process(self, proc: subprocess.Popen[str] | None, name: str) -> None:
        if not self.is_running(proc):
            self.logger.info(
                "%s уже остановлен или не запускался из панели, поэтому останавливать сейчас нечего.",
                name.capitalize(),
            )
            return

        self.logger.info(
            "Останавливаю %s по запросу из панели. Сначала отправляется мягкое завершение процесса.",
            name,
        )
        try:
            proc.terminate()
            proc.wait(timeout=3)
            self.logger.info("%s остановлен корректно.", name.capitalize())
        except Exception:
            self.logger.warning(
                "%s не завершился вовремя после terminate(), поэтому будет выполнен kill().",
                name.capitalize(),
            )
            try:
                proc.kill()
                self.logger.info("%s был принудительно остановлен через kill().", name.capitalize())
            except Exception as error:
                self.logger.exception("Не удалось принудительно остановить %s: %s", name, error)

    def stop_backend(self) -> None:
        self._stop_process(self.backend_proc, "backend")
        self.backend_proc = None

    def stop_frontend(self) -> None:
        self._stop_process(self.frontend_proc, "frontend")
        self.frontend_proc = None

    def restart_backend(self) -> None:
        self.logger.info("Перезапуск backend: сначала остановка, затем запуск через %sms.", RESTART_DELAY_MS)
        self.stop_backend()
        self.root.after(RESTART_DELAY_MS, self.start_backend)

    def restart_frontend(self) -> None:
        self.logger.info("Перезапуск frontend: сначала остановка, затем запуск через %sms.", RESTART_DELAY_MS)
        self.stop_frontend()
        self.root.after(RESTART_DELAY_MS, self.start_frontend)

    def start_all(self) -> None:
        self.logger.info("Запускаю backend и frontend вместе по команде Start All.")
        self.start_backend()
        self.start_frontend()

    def stop_all(self) -> None:
        self.logger.info("Останавливаю все процессы, которые были запущены из панели и ещё активны.")
        self.stop_backend()
        self.stop_frontend()

    def restart_all(self) -> None:
        self.logger.info(
            "Перезапуск всех сервисов: сначала полная остановка, затем общий старт через %sms.",
            RESTART_ALL_DELAY_MS,
        )
        self.stop_all()
        self.root.after(RESTART_ALL_DELAY_MS, self.start_all)

    def on_close(self) -> None:
        self.logger.info("Пользователь запросил закрытие панели. Будет предложено остановить backend/frontend.")
        if messagebox.askyesno("Выход", "Закрыть панель и остановить backend/frontend?"):
            self.logger.info("Подтверждено закрытие окна с остановкой управляемых процессов.")
            self.stop_all()
            self.root.destroy()
        else:
            self.logger.info("Закрытие окна отменено пользователем; процессы продолжают работать.")


def main() -> None:
    root = tk.Tk()
    ProcessControllerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
