# -*- coding: utf-8 -*-

from __future__ import annotations

import os
import subprocess
import sys
import tkinter as tk
from pathlib import Path
from tkinter import messagebox

WINDOWS_NEW_CONSOLE = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
POLL_INTERVAL_MS = 1000
RESTART_DELAY_MS = 500
RESTART_ALL_DELAY_MS = 700


class ProcessControllerApp:
    def __init__(self, root: tk.Tk) -> None:
        self.root = root
        self.root.title("CubixRecipes Control Panel")
        self.root.geometry("520x260")
        self.root.resizable(False, False)

        self.root_dir = Path(__file__).resolve().parent
        self.backend_dir = self.root_dir / "backend"
        self.frontend_dir = self.root_dir / "frontend"

        self.backend_proc: subprocess.Popen[str] | None = None
        self.frontend_proc: subprocess.Popen[str] | None = None

        self.backend_status: tk.Label
        self.frontend_status: tk.Label

        self._create_widgets()
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
            text="Совет: frontend удобнее перезапускать этой кнопкой, чем вручную через консоль.",
            font=("Arial", 9),
        )
        hint.pack(pady=10)

    def is_running(self, proc: subprocess.Popen[str] | None) -> bool:
        return proc is not None and proc.poll() is None

    def _update_status_labels(self) -> None:
        backend_text = "Backend: работает" if self.is_running(self.backend_proc) else "Backend: остановлен"
        frontend_text = "Frontend: работает" if self.is_running(self.frontend_proc) else "Frontend: остановлен"

        self.backend_status.config(text=backend_text)
        self.frontend_status.config(text=frontend_text)
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
        messagebox.showerror("Ошибка", f"Папка {name} не найдена:\n{directory}")

    def _start_process(
        self,
        current_proc: subprocess.Popen[str] | None,
        directory: Path,
        command: list[str] | str,
        use_shell: bool,
        name: str,
    ) -> subprocess.Popen[str] | None:
        if self.is_running(current_proc):
            return current_proc

        if not directory.is_dir():
            self._show_missing_dir_error(name, directory)
            return None

        try:
            return subprocess.Popen(
                command,
                cwd=directory,
                shell=use_shell,
                creationflags=self._creation_flags(),
            )
        except OSError as error:
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

    def _stop_process(self, proc: subprocess.Popen[str] | None) -> None:
        if not self.is_running(proc):
            return

        try:
            proc.terminate()
            proc.wait(timeout=3)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass

    def stop_backend(self) -> None:
        self._stop_process(self.backend_proc)
        self.backend_proc = None

    def stop_frontend(self) -> None:
        self._stop_process(self.frontend_proc)
        self.frontend_proc = None

    def restart_backend(self) -> None:
        self.stop_backend()
        self.root.after(RESTART_DELAY_MS, self.start_backend)

    def restart_frontend(self) -> None:
        self.stop_frontend()
        self.root.after(RESTART_DELAY_MS, self.start_frontend)

    def start_all(self) -> None:
        self.start_backend()
        self.start_frontend()

    def stop_all(self) -> None:
        self.stop_backend()
        self.stop_frontend()

    def restart_all(self) -> None:
        self.stop_all()
        self.root.after(RESTART_ALL_DELAY_MS, self.start_all)

    def on_close(self) -> None:
        if messagebox.askyesno("Выход", "Закрыть панель и остановить backend/frontend?"):
            self.stop_all()
            self.root.destroy()


def main() -> None:
    root = tk.Tk()
    ProcessControllerApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
