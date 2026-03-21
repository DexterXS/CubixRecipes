# -*- coding: utf-8 -*-

from __future__ import annotations

import logging
import os
import queue
import subprocess
import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import messagebox, ttk
from tkinter.scrolledtext import ScrolledText

POLL_INTERVAL_MS = 1000
STREAM_POLL_MS = 120
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


class ConsolePane:
    def __init__(self, parent: ttk.Notebook, title: str) -> None:
        self.frame = ttk.Frame(parent)
        parent.add(self.frame, text=title)

        description = tk.Label(
            self.frame,
            text=f"Вкладка показывает вывод процесса {title.lower()} в реальном времени.",
            font=("Arial", 9),
            anchor="w",
            justify=tk.LEFT,
        )
        description.pack(fill=tk.X, padx=10, pady=(10, 6))

        self.output = ScrolledText(
            self.frame,
            height=20,
            state=tk.DISABLED,
            font=("Consolas", 9),
            wrap=tk.WORD,
        )
        self.output.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))

    def append(self, text: str) -> None:
        if not text:
            return

        self.output.configure(state=tk.NORMAL)
        self.output.insert(tk.END, text)
        self.output.see(tk.END)
        self.output.configure(state=tk.DISABLED)

    def write_line(self, text: str) -> None:
        self.append(text.rstrip("\n") + "\n")

    def clear(self) -> None:
        self.output.configure(state=tk.NORMAL)
        self.output.delete("1.0", tk.END)
        self.output.configure(state=tk.DISABLED)


class ManagedProcess:
    def __init__(self, name: str, directory: Path, console: ConsolePane) -> None:
        self.name = name
        self.directory = directory
        self.console = console
        self.proc: subprocess.Popen[str] | None = None
        self.output_queue: queue.Queue[str] = queue.Queue()
        self.reader_thread: threading.Thread | None = None
        self.last_return_code: int | None = None

    def is_running(self) -> bool:
        return self.proc is not None and self.proc.poll() is None

    def reset_output(self) -> None:
        self.console.clear()
        self.output_queue = queue.Queue()
        self.reader_thread = None


class ProcessControllerApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("CubixRecipes Control Panel")
        self.root.geometry("860x700")
        self.root.resizable(True, True)
        self.root.minsize(760, 620)

        self.root_dir = Path(__file__).resolve().parent
        self.backend_dir = self.root_dir / "backend"
        self.frontend_dir = self.root_dir / "frontend"

        self.backend_status: tk.Label
        self.frontend_status: tk.Label
        self.log_output: ScrolledText
        self.notebook: ttk.Notebook

        self.logger = logging.getLogger("cubixrecipes.start_dev")
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False
        self._status_snapshot: tuple[bool, bool] | None = None

        self._create_widgets()

        self.backend = ManagedProcess("backend", self.backend_dir, self.backend_console)
        self.frontend = ManagedProcess("frontend", self.frontend_dir, self.frontend_console)
        self.managed_processes = [self.backend, self.frontend]

        self._configure_logging()
        self._log_environment_summary()
        self._update_status_labels()
        self._poll_process_output()
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

        tk.Button(backend_frame, text="Start Backend", width=15, command=self.start_backend).pack(side=tk.LEFT, padx=5)
        tk.Button(backend_frame, text="Stop Backend", width=15, command=self.stop_backend).pack(side=tk.LEFT, padx=5)
        tk.Button(backend_frame, text="Restart Backend", width=15, command=self.restart_backend).pack(side=tk.LEFT, padx=5)

        self.frontend_status = tk.Label(self.root, text="Frontend: неизвестно", font=("Arial", 11))
        self.frontend_status.pack(pady=10)

        frontend_frame = tk.Frame(self.root)
        frontend_frame.pack(pady=5)

        tk.Button(frontend_frame, text="Start Frontend", width=15, command=self.start_frontend).pack(side=tk.LEFT, padx=5)
        tk.Button(frontend_frame, text="Stop Frontend", width=15, command=self.stop_frontend).pack(side=tk.LEFT, padx=5)
        tk.Button(frontend_frame, text="Restart Frontend", width=15, command=self.restart_frontend).pack(side=tk.LEFT, padx=5)

        global_frame = tk.Frame(self.root)
        global_frame.pack(pady=20)

        tk.Button(global_frame, text="Start All", width=15, command=self.start_all).pack(side=tk.LEFT, padx=5)
        tk.Button(global_frame, text="Stop All", width=15, command=self.stop_all).pack(side=tk.LEFT, padx=5)
        tk.Button(global_frame, text="Restart All", width=15, command=self.restart_all).pack(side=tk.LEFT, padx=5)

        hint = tk.Label(
            self.root,
            text=(
                "Ниже доступны вкладки с отдельными консолями backend/frontend и журналом управления. "
                "Вывод процессов больше не открывается во внешних окнах."
            ),
            font=("Arial", 9),
            wraplength=760,
            justify=tk.CENTER,
        )
        hint.pack(pady=(0, 10))

        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0, 12))

        self.backend_console = ConsolePane(self.notebook, "Backend Console")
        self.frontend_console = ConsolePane(self.notebook, "Frontend Console")
        log_frame = ttk.Frame(self.notebook)
        self.notebook.add(log_frame, text="Action Log")

        tk.Label(log_frame, text="Журнал действий панели", font=("Arial", 10, "bold")).pack(anchor="w", padx=10, pady=(10, 6))
        self.log_output = ScrolledText(log_frame, height=12, state=tk.DISABLED, font=("Consolas", 9))
        self.log_output.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))

    def _configure_logging(self) -> None:
        if self.logger.handlers:
            self.logger.handlers.clear()

        self.logger.addHandler(TkTextHandler(self.log_output))

    def _log_environment_summary(self) -> None:
        self.logger.info("Панель управления запущена. Корень проекта: %s", self.root_dir)
        self.logger.info("Backend и frontend запускаются внутри этой программы, каждая служба пишет вывод в свою вкладку.")
        self.logger.info("Остановить можно только процессы, которые были запущены этой панелью и всё ещё активны.")

    def _write_process_line(self, managed: ManagedProcess, text: str) -> None:
        managed.console.write_line(text)

    def _poll_process_output(self) -> None:
        for managed in self.managed_processes:
            while True:
                try:
                    chunk = managed.output_queue.get_nowait()
                except queue.Empty:
                    break
                managed.console.append(chunk)

        self.root.after(STREAM_POLL_MS, self._poll_process_output)

    def _stream_process_output(self, managed: ManagedProcess) -> None:
        proc = managed.proc
        if proc is None or proc.stdout is None:
            return

        try:
            for line in proc.stdout:
                managed.output_queue.put(line)
        finally:
            if proc.stdout is not None:
                proc.stdout.close()

    def is_running(self, managed: ManagedProcess) -> bool:
        return managed.is_running()

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

    def _report_unexpected_exit(self, managed: ManagedProcess) -> None:
        if managed.proc is None:
            return

        return_code = managed.proc.poll()
        if return_code is None or return_code == managed.last_return_code:
            return

        managed.last_return_code = return_code
        self.logger.warning("Процесс %s завершился с кодом %s. Подробности смотри во вкладке %s.", managed.name, return_code, managed.console.frame.master.tab(managed.console.frame, 'text'))
        self._write_process_line(managed, f"\n[process exited with code {return_code}]\n")

    def _update_status_labels(self) -> None:
        backend_running = self.is_running(self.backend)
        frontend_running = self.is_running(self.frontend)

        self._report_unexpected_exit(self.backend)
        self._report_unexpected_exit(self.frontend)

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

    def _show_missing_dir_error(self, name: str, directory: Path) -> None:
        self.logger.error("Запуск %s невозможен: не найдена папка %s", name, directory)
        messagebox.showerror("Ошибка", f"Папка {name} не найдена:\n{directory}")

    def _validate_frontend_setup(self) -> bool:
        package_json = self.frontend_dir / "package.json"
        node_modules = self.frontend_dir / "node_modules"

        if not package_json.is_file():
            self.logger.error("Frontend не может быть запущен: отсутствует файл %s", package_json)
            messagebox.showerror("Ошибка frontend", f"Не найден файл frontend/package.json:\n{package_json}")
            return False

        if not node_modules.is_dir():
            self.logger.error(
                "Frontend не может быть запущен: отсутствует папка node_modules. Сначала выполните npm install в %s",
                self.frontend_dir,
            )
            messagebox.showerror(
                "Ошибка frontend",
                "Frontend зависимости не установлены.\n" f"Выполните npm install в папке:\n{self.frontend_dir}",
            )
            return False

        return True

    def _describe_command(self, command: list[str] | str) -> str:
        if isinstance(command, list):
            return " ".join(command)
        return command

    def _start_process(
        self,
        managed: ManagedProcess,
        command: list[str] | str,
        use_shell: bool,
    ) -> None:
        if self.is_running(managed):
            self.logger.info(
                "%s уже запущен, поэтому повторный старт пропущен. Этот процесс можно остановить кнопкой Stop %s.",
                managed.name.capitalize(),
                managed.name.capitalize(),
            )
            return

        if not managed.directory.is_dir():
            self._show_missing_dir_error(managed.name, managed.directory)
            return

        managed.reset_output()
        managed.last_return_code = None
        self._write_process_line(managed, f"$ {self._describe_command(command)}")
        self.logger.info(
            "Запускаю %s внутри встроенной вкладки-консоли. Рабочая папка: %s. Команда: %s",
            managed.name,
            managed.directory,
            self._describe_command(command),
        )

        try:
            managed.proc = subprocess.Popen(
                command,
                cwd=managed.directory,
                shell=use_shell,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                stdin=subprocess.PIPE,
                text=True,
                bufsize=1,
            )
            managed.reader_thread = threading.Thread(
                target=self._stream_process_output,
                args=(managed,),
                daemon=True,
            )
            managed.reader_thread.start()
            self.logger.info(
                "%s успешно запущен (pid=%s). Вывод доступен во вкладке %s.",
                managed.name.capitalize(),
                managed.proc.pid,
                managed.console.frame.master.tab(managed.console.frame, 'text'),
            )
        except OSError as error:
            managed.proc = None
            self.logger.exception("Не удалось запустить %s: %s", managed.name, error)
            messagebox.showerror("Ошибка запуска", f"Не удалось запустить {managed.name}:\n{error}")

    def start_backend(self) -> None:
        command, use_shell = self._build_backend_command()
        self.notebook.select(self.backend_console.frame)
        self._start_process(self.backend, command, use_shell)

    def start_frontend(self) -> None:
        if not self._validate_frontend_setup():
            return

        command, use_shell = self._build_frontend_command()
        self.notebook.select(self.frontend_console.frame)
        self._start_process(self.frontend, command, use_shell)

    def _stop_process(self, managed: ManagedProcess) -> None:
        if not self.is_running(managed):
            self.logger.info(
                "%s уже остановлен или не запускался из панели, поэтому останавливать сейчас нечего.",
                managed.name.capitalize(),
            )
            return

        self.logger.info(
            "Останавливаю %s по запросу из панели. Сначала отправляется мягкое завершение процесса.",
            managed.name,
        )
        self._write_process_line(managed, "\n[stop requested]\n")
        try:
            assert managed.proc is not None
            managed.proc.terminate()
            managed.proc.wait(timeout=3)
            self.logger.info("%s остановлен корректно.", managed.name.capitalize())
            self._write_process_line(managed, "[stopped gracefully]\n")
        except Exception:
            self.logger.warning(
                "%s не завершился вовремя после terminate(), поэтому будет выполнен kill().",
                managed.name.capitalize(),
            )
            try:
                assert managed.proc is not None
                managed.proc.kill()
                self.logger.info("%s был принудительно остановлен через kill().", managed.name.capitalize())
                self._write_process_line(managed, "[killed forcefully]\n")
            except Exception as error:
                self.logger.exception("Не удалось принудительно остановить %s: %s", managed.name, error)
        finally:
            if managed.proc is not None:
                managed.last_return_code = managed.proc.poll()
            managed.proc = None

    def stop_backend(self) -> None:
        self._stop_process(self.backend)

    def stop_frontend(self) -> None:
        self._stop_process(self.frontend)

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
