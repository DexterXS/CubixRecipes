# -*- coding: utf-8 -*-

from __future__ import annotations

import json
import logging
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import tkinter as tk
import webbrowser
from urllib.error import URLError, HTTPError
from urllib.request import Request, urlopen
from dataclasses import dataclass, field
from pathlib import Path
from tkinter import filedialog, messagebox, ttk
from tkinter.scrolledtext import ScrolledText
from typing import Any, Optional, Union

POLL_INTERVAL_MS = 1000
STREAM_POLL_MS = 120
RESTART_DELAY_MS = 500
RESTART_ALL_DELAY_MS = 700
LOG_FORMAT = "%(asctime)s | %(levelname)s | %(message)s"
BACKEND_API_BASE_URL = "http://127.0.0.1:8000"
ANSI_ESCAPE_RE = re.compile(r"\x1B(?:[@-Z\-_]|\[[0-?]*[ -/]*[@-~])")
URL_RE = re.compile(r"https?://[^\s]+")
MOJIBAKE_REPLACEMENTS = {
    "вЫє": "-",
    "вЫ ": "-",
    "в\x80¢": "-",
    "âžœ": "-",
    "â†’": "->",
}


@dataclass
class PanelProjectConfig:
    scripts_dir: str = "scripts"
    mods_dir: str = ""
    assets_dir: str = ""
    recipe_db_path: str = ""
    extra_icon_sources: list[str] = field(default_factory=list)
    extra_recipe_sources: list[str] = field(default_factory=list)
    verbose_debug_logging: bool = False

    def to_dict(self, config_path: Path) -> dict[str, Any]:
        return {
            "scripts_dir": self.scripts_dir,
            "mods_dir": self.mods_dir,
            "assets_dir": self.assets_dir,
            "recipe_db_path": self.recipe_db_path,
            "extra_icon_sources": self.extra_icon_sources,
            "extra_recipe_sources": self.extra_recipe_sources,
            "verbose_debug_logging": self.verbose_debug_logging,
            "project_config_path": str(config_path),
        }


class ProjectConfigStore:
    def __init__(self, root_dir: Path) -> None:
        self.config_path = root_dir / "cubixrecipes.config.json"

    def load(self) -> PanelProjectConfig:
        if not self.config_path.exists():
            config = PanelProjectConfig()
            self.save(config)
            return config
        payload = json.loads(self.config_path.read_text(encoding="utf-8"))
        return PanelProjectConfig(
            scripts_dir=str(payload.get("scripts_dir", "scripts") or "scripts"),
            mods_dir=str(payload.get("mods_dir", "") or ""),
            assets_dir=str(payload.get("assets_dir", "") or ""),
            recipe_db_path=str(payload.get("recipe_db_path", "") or ""),
            extra_icon_sources=self._coerce_list(payload.get("extra_icon_sources", [])),
            extra_recipe_sources=self._coerce_list(payload.get("extra_recipe_sources", [])),
            verbose_debug_logging=bool(payload.get("verbose_debug_logging", False)),
        )

    def save(self, config: PanelProjectConfig) -> None:
        self.config_path.write_text(json.dumps(config.to_dict(self.config_path), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def _coerce_list(self, value: Any) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            return [line.strip() for line in value.splitlines() if line.strip()]
        return []


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
            state=tk.NORMAL,
            font=("Consolas", 9),
            wrap=tk.WORD,
            cursor="xterm",
            exportselection=False,
            insertwidth=0,
        )
        self.output.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))
        self.output.tag_configure("link", foreground="#1a73e8", underline=True)
        self.output.tag_bind("link", "<Button-1>", self._open_clicked_link)
        self.output.tag_bind("link", "<Enter>", lambda _event: self.output.config(cursor="hand2"))
        self.output.tag_bind("link", "<Leave>", lambda _event: self.output.config(cursor="xterm"))
        self.output.bind("<Control-c>", self._copy_selection)
        self.output.bind("<Control-C>", self._copy_selection)
        self.output.bind("<Button-3>", self._copy_selection)
        self.output.bind("<Key>", self._block_edit_keys)

    def append(self, text: str) -> None:
        if not text:
            return
        start_index = self.output.index(tk.END + "-1c")
        self.output.insert(tk.END, text)
        end_index = self.output.index(tk.END + "-1c")
        self._tag_links(start_index, end_index)
        self.output.see(tk.END)

    def write_line(self, text: str) -> None:
        self.append(text.rstrip("\n") + "\n")

    def clear(self) -> None:
        self.output.delete("1.0", tk.END)

    def _tag_links(self, start_index: str, end_index: str) -> None:
        block = self.output.get(start_index, end_index)
        for match in URL_RE.finditer(block):
            tag_start = f"{start_index}+{match.start()}c"
            tag_end = f"{start_index}+{match.end()}c"
            self.output.tag_add("link", tag_start, tag_end)

    def _copy_selection(self, _event: tk.Event[tk.Misc]) -> Optional[str]:
        try:
            selected_text = self.output.get("sel.first", "sel.last")
        except tk.TclError:
            return "break"
        self.output.clipboard_clear()
        self.output.clipboard_append(selected_text)
        return "break"

    def _block_edit_keys(self, event: tk.Event[tk.Misc]) -> Optional[str]:
        if (event.state & 0x4) and event.keysym.lower() == "c":
            return None
        return "break"

    def _open_clicked_link(self, event: tk.Event[tk.Misc]) -> str:
        index = self.output.index(f"@{event.x},{event.y}")
        for start, end in zip(self.output.tag_ranges("link")[::2], self.output.tag_ranges("link")[1::2]):
            if self.output.compare(index, ">=", start) and self.output.compare(index, "<", end):
                webbrowser.open(self.output.get(start, end))
                break
        return "break"




class DebugPane:
    def __init__(self, parent: ttk.Notebook) -> None:
        self.frame = ttk.Frame(parent)
        parent.add(self.frame, text="Debug")

        header = tk.Label(
            self.frame,
            text=(
                "Подробная backend-диагностика: активный config, recipe scan, asset scan, resolver, parse, errors и missing links. "
                "Кнопки ниже запрашивают реальные структурированные debug endpoints."
            ),
            wraplength=900,
            justify=tk.LEFT,
            anchor="w",
        )
        header.pack(fill=tk.X, padx=10, pady=(10, 8))

        actions = ttk.Frame(self.frame)
        actions.pack(fill=tk.X, padx=10, pady=(0, 8))
        self.refresh_button = ttk.Button(actions, text="Refresh Debug Info")
        self.refresh_button.pack(side=tk.LEFT, padx=(0, 8))
        self.rescan_recipes_button = ttk.Button(actions, text="Rescan Recipes")
        self.rescan_recipes_button.pack(side=tk.LEFT, padx=(0, 8))
        self.rescan_assets_button = ttk.Button(actions, text="Rescan Assets")
        self.rescan_assets_button.pack(side=tk.LEFT, padx=(0, 8))
        self.clear_button = ttk.Button(actions, text="Clear Debug Log")
        self.clear_button.pack(side=tk.LEFT)

        summary_label = tk.Label(self.frame, text="Summary", font=("Arial", 10, "bold"), anchor="w")
        summary_label.pack(fill=tk.X, padx=10)
        self.summary = ScrolledText(self.frame, height=6, font=("Consolas", 9), wrap=tk.WORD)
        self.summary.pack(fill=tk.X, padx=10, pady=(0, 8))

        self.sections: dict[str, ScrolledText] = {}
        for key, title in [
            ("config", "Config"),
            ("recipe_scan", "Recipe Scan"),
            ("asset_scan", "Asset Scan"),
            ("resolver", "Resolver"),
            ("parse", "Parse"),
            ("errors", "Errors"),
            ("missing_links", "Missing Links"),
        ]:
            pane = ttk.LabelFrame(self.frame, text=title)
            pane.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 8))
            widget = ScrolledText(pane, height=8, font=("Consolas", 9), wrap=tk.WORD)
            widget.pack(fill=tk.BOTH, expand=True, padx=6, pady=6)
            self.sections[key] = widget

    def render(self, payload: dict[str, Any]) -> None:
        summary = payload.get("summary", {})
        summary_lines = [
            f"recipes scanned: {summary.get('recipes_scanned', 0)}",
            f"recipes failed: {summary.get('recipes_failed', 0)}",
            f"assets scanned: {summary.get('assets_scanned', 0)}",
            f"icons found: {summary.get('icons_found', 0)}",
            f"icons missing: {summary.get('icons_missing', 0)}",
            f"lang entries loaded: {summary.get('lang_entries_loaded', 0)}",
            f"parse warnings: {summary.get('parse_warnings', 0)}",
            f"errors: {summary.get('errors', 0)}",
        ]
        self._write_widget(self.summary, "\n".join(summary_lines))
        for key, widget in self.sections.items():
            self._write_widget(widget, json.dumps(payload.get(key, {} if key not in {'errors', 'missing_links'} else []), ensure_ascii=False, indent=2))

    def clear(self) -> None:
        self._write_widget(self.summary, "")
        for widget in self.sections.values():
            self._write_widget(widget, "")

    def _write_widget(self, widget: ScrolledText, text: str) -> None:
        widget.configure(state=tk.NORMAL)
        widget.delete("1.0", tk.END)
        widget.insert("1.0", text)
        widget.configure(state=tk.DISABLED)

class UnifiedLogPane:
    def __init__(self, parent: ttk.Notebook) -> None:
        self.frame = ttk.Frame(parent)
        parent.add(self.frame, text="Full Debug Log")

        header = tk.Label(
            self.frame,
            text=(
                "Единый событийный лог для backend/frontend/API/UI. Здесь по времени собираются структурированные записи, "
                "которые можно целиком скопировать и отдать ИИ для анализа."
            ),
            wraplength=900,
            justify=tk.LEFT,
            anchor="w",
        )
        header.pack(fill=tk.X, padx=10, pady=(10, 8))

        controls = ttk.Frame(self.frame)
        controls.pack(fill=tk.X, padx=10, pady=(0, 8))
        ttk.Label(controls, text="Source").pack(side=tk.LEFT)
        self.source_var = tk.StringVar(value="All")
        self.source_filter = ttk.Combobox(controls, textvariable=self.source_var, values=["All", "BACKEND", "FRONTEND", "API", "RESOLVER", "ASSETS", "RECIPES", "UI", "ICON", "SYSTEM", "CONTROL_PANEL"], width=12, state="readonly")
        self.source_filter.pack(side=tk.LEFT, padx=(6, 12))
        ttk.Label(controls, text="Level").pack(side=tk.LEFT)
        self.level_var = tk.StringVar(value="All")
        self.level_filter = ttk.Combobox(controls, textvariable=self.level_var, values=["All", "INFO", "WARN", "ERROR", "DEBUG"], width=10, state="readonly")
        self.level_filter.pack(side=tk.LEFT, padx=(6, 12))
        self.autoscroll_var = tk.BooleanVar(value=True)
        ttk.Checkbutton(controls, text="Auto-scroll", variable=self.autoscroll_var).pack(side=tk.LEFT, padx=(0, 12))
        self.refresh_button = ttk.Button(controls, text="Refresh Log")
        self.refresh_button.pack(side=tk.LEFT, padx=(0, 8))
        self.copy_button = ttk.Button(controls, text="Copy Full Log")
        self.copy_button.pack(side=tk.LEFT, padx=(0, 8))
        self.save_button = ttk.Button(controls, text="Save Log To File")
        self.save_button.pack(side=tk.LEFT, padx=(0, 8))
        self.clear_button = ttk.Button(controls, text="Clear Log")
        self.clear_button.pack(side=tk.LEFT)

        self.status_var = tk.StringVar(value='URL: not requested yet')
        ttk.Label(self.frame, textvariable=self.status_var, justify=tk.LEFT, anchor='w').pack(fill=tk.X, padx=10, pady=(0, 6))
        self.test_button = ttk.Button(controls, text='Test Debug Pipeline')
        self.test_button.pack(side=tk.LEFT, padx=(8, 0))
        self.output = ScrolledText(self.frame, height=28, font=("Consolas", 9), wrap=tk.WORD)
        self.output.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))
        self.output.configure(state=tk.DISABLED)
        self.current_text = ''

    def set_status(self, text: str) -> None:
        self.status_var.set(text)

    def render(self, text: str) -> None:
        self.current_text = text
        self.output.configure(state=tk.NORMAL)
        self.output.delete('1.0', tk.END)
        self.output.insert('1.0', text)
        if self.autoscroll_var.get():
            self.output.see(tk.END)
        self.output.configure(state=tk.DISABLED)

    def copy_all(self) -> None:
        self.output.clipboard_clear()
        self.output.clipboard_append(self.current_text)

    def save_to_file(self, initialdir: Path) -> Optional[str]:
        path = filedialog.asksaveasfilename(initialdir=initialdir, defaultextension='.log', filetypes=[('Log files', '*.log'), ('Text files', '*.txt'), ('All files', '*.*')])
        if not path:
            return None
        Path(path).write_text(self.current_text, encoding='utf-8')
        return path

    def clear(self) -> None:
        self.render('')


class ManagedProcess:
    def __init__(self, name: str, directory: Path, console: ConsolePane) -> None:
        self.name = name
        self.directory = directory
        self.console = console
        self.proc: Optional[subprocess.Popen[str]] = None
        self.output_queue: queue.Queue[str] = queue.Queue()
        self.reader_thread: Optional[threading.Thread] = None
        self.last_return_code: Optional[int] = None

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
        self.root.geometry("960x860")
        self.root.resizable(True, True)
        self.root.minsize(860, 700)

        self.root_dir = Path(__file__).resolve().parent
        self.backend_dir = self.root_dir / "backend"
        self.frontend_dir = self.root_dir / "frontend"
        self.config_store = ProjectConfigStore(self.root_dir)
        self.project_config = self.config_store.load()

        self.backend_status: tk.Label
        self.frontend_status: tk.Label
        self.log_output: ScrolledText
        self.notebook: ttk.Notebook
        self.settings_vars: dict[str, tk.StringVar] = {}
        self.validation_labels: dict[str, tk.Label] = {}
        self.debug_pane: DebugPane
        self.full_log_pane: UnifiedLogPane

        self.logger = logging.getLogger("cubixrecipes.start_dev")
        self.logger.setLevel(logging.INFO)
        self.logger.propagate = False
        self._status_snapshot: Optional[tuple[bool, bool]] = None

        self._create_widgets()

        self.backend = ManagedProcess("backend", self.backend_dir, self.backend_console)
        self.frontend = ManagedProcess("frontend", self.frontend_dir, self.frontend_console)
        self.managed_processes = [self.backend, self.frontend]

        self._configure_logging()
        self._apply_loaded_settings_to_form()
        self._log_environment_summary()
        self._update_status_labels()
        self._poll_process_output()
        self._poll_unified_log()
        self.root.protocol("WM_DELETE_WINDOW", self.on_close)

    def _create_widgets(self) -> None:
        title = tk.Label(self.root, text="Управление CubixRecipes", font=("Arial", 14, "bold"))
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
                "Ниже доступны вкладки с отдельными консолями backend/frontend, настройками путей и журналом управления. "
                "Вывод процессов больше не открывается во внешних окнах."
            ),
            font=("Arial", 9),
            wraplength=860,
            justify=tk.CENTER,
        )
        hint.pack(pady=(0, 10))

        self.notebook = ttk.Notebook(self.root)
        self.notebook.pack(fill=tk.BOTH, expand=True, padx=12, pady=(0, 12))

        self.backend_console = ConsolePane(self.notebook, "Backend Console")
        self.frontend_console = ConsolePane(self.notebook, "Frontend Console")
        self.debug_pane = DebugPane(self.notebook)
        self.full_log_pane = UnifiedLogPane(self.notebook)
        self._create_settings_tab()
        log_frame = ttk.Frame(self.notebook)
        self.notebook.add(log_frame, text="Action Log")
        tk.Label(log_frame, text="Журнал действий панели", font=("Arial", 10, "bold")).pack(anchor="w", padx=10, pady=(10, 6))
        self.log_output = ScrolledText(log_frame, height=12, state=tk.DISABLED, font=("Consolas", 9))
        self.log_output.pack(fill=tk.BOTH, expand=True, padx=10, pady=(0, 10))
        self.debug_pane.refresh_button.configure(command=self.refresh_debug_info)
        self.debug_pane.rescan_recipes_button.configure(command=self.rescan_debug_recipes)
        self.debug_pane.rescan_assets_button.configure(command=self.rescan_debug_assets)
        self.debug_pane.clear_button.configure(command=self.clear_debug_log)
        self.full_log_pane.refresh_button.configure(command=self.refresh_unified_log)
        self.full_log_pane.copy_button.configure(command=self.copy_unified_log)
        self.full_log_pane.save_button.configure(command=self.save_unified_log)
        self.full_log_pane.clear_button.configure(command=self.clear_unified_log)
        self.full_log_pane.test_button.configure(command=self.test_debug_pipeline)
        self.full_log_pane.source_filter.bind('<<ComboboxSelected>>', lambda _event: self.refresh_unified_log())
        self.full_log_pane.level_filter.bind('<<ComboboxSelected>>', lambda _event: self.refresh_unified_log())

    def _create_settings_tab(self) -> None:
        settings_frame = ttk.Frame(self.notebook)
        self.notebook.add(settings_frame, text="Settings")
        tk.Label(settings_frame, text="Project Paths", font=("Arial", 11, "bold")).pack(anchor="w", padx=10, pady=(10, 4))
        tk.Label(
            settings_frame,
            text=(
                "Укажите пути к `.zs`, модам, ассетам и дополнительным источникам. Настройки сохраняются в cubixrecipes.config.json "
                "и backend использует их при следующем запуске или через API настроек."
            ),
            wraplength=860,
            justify=tk.LEFT,
        ).pack(anchor="w", padx=10, pady=(0, 10))

        form = ttk.Frame(settings_frame)
        form.pack(fill=tk.X, padx=10)
        form.columnconfigure(1, weight=1)

        self._add_path_row(form, 0, "scripts_dir", "Scripts (.zs)", directory=True)
        self._add_path_row(form, 1, "mods_dir", "Mods directory", directory=True)
        self._add_path_row(form, 2, "assets_dir", "Assets directory", directory=True)
        self._add_path_row(form, 3, "recipe_db_path", "Recipe DB path", directory=False, save_file=True)

        self._add_multiline_row(form, 4, "extra_icon_sources", "Extra icon sources")
        self._add_multiline_row(form, 5, "extra_recipe_sources", "Extra recipe sources")

        actions = ttk.Frame(settings_frame)
        actions.pack(fill=tk.X, padx=10, pady=(10, 8))
        ttk.Button(actions, text="Save Settings", command=self.save_settings).pack(side=tk.LEFT, padx=(0, 8))
        self.verbose_debug_var = tk.BooleanVar(value=self.project_config.verbose_debug_logging)
        ttk.Checkbutton(actions, text="Verbose debug logging", variable=self.verbose_debug_var).pack(side=tk.LEFT, padx=(12, 0))
        ttk.Button(actions, text="Reload Settings", command=self.reload_settings).pack(side=tk.LEFT)

        self.settings_summary = tk.Label(settings_frame, text="", justify=tk.LEFT, anchor="w")
        self.settings_summary.pack(fill=tk.X, padx=10, pady=(0, 10))

    def _add_path_row(self, parent: ttk.Frame, row: int, key: str, label: str, directory: bool, save_file: bool = False) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="w", padx=(0, 8), pady=4)
        variable = tk.StringVar()
        entry = ttk.Entry(parent, textvariable=variable)
        entry.grid(row=row, column=1, sticky="ew", pady=4)
        ttk.Button(parent, text="Browse...", command=lambda: self._browse_path(key, directory=directory, save_file=save_file)).grid(row=row, column=2, padx=(8, 0), pady=4)
        validation = tk.Label(parent, text="", anchor="w")
        validation.grid(row=row, column=3, sticky="w", padx=(8, 0), pady=4)
        variable.trace_add("write", lambda *_args, name=key: self._update_validation_label(name))
        self.settings_vars[key] = variable
        self.validation_labels[key] = validation

    def _add_multiline_row(self, parent: ttk.Frame, row: int, key: str, label: str) -> None:
        ttk.Label(parent, text=label).grid(row=row, column=0, sticky="nw", padx=(0, 8), pady=4)
        widget = ScrolledText(parent, height=4, font=("Consolas", 9), wrap=tk.WORD)
        widget.grid(row=row, column=1, sticky="ew", pady=4)
        actions = ttk.Frame(parent)
        actions.grid(row=row, column=2, sticky="n", padx=(8, 0), pady=4)
        ttk.Button(actions, text="Add dir...", command=lambda: self._append_multiline_directory(key)).pack(fill=tk.X)
        validation = tk.Label(parent, text="", anchor="nw", justify=tk.LEFT)
        validation.grid(row=row, column=3, sticky="nw", padx=(8, 0), pady=4)
        self.settings_vars[key] = tk.StringVar()
        self.validation_labels[key] = validation
        setattr(self, f"{key}_widget", widget)

    def _configure_logging(self) -> None:
        if self.logger.handlers:
            self.logger.handlers.clear()
        self.logger.addHandler(TkTextHandler(self.log_output))

    def _apply_loaded_settings_to_form(self) -> None:
        self.settings_vars["scripts_dir"].set(self.project_config.scripts_dir)
        self.settings_vars["mods_dir"].set(self.project_config.mods_dir)
        self.settings_vars["assets_dir"].set(self.project_config.assets_dir)
        self.settings_vars["recipe_db_path"].set(self.project_config.recipe_db_path)
        self.extra_icon_sources_widget.delete("1.0", tk.END)
        self.extra_icon_sources_widget.insert("1.0", "\n".join(self.project_config.extra_icon_sources))
        self.extra_recipe_sources_widget.delete("1.0", tk.END)
        self.extra_recipe_sources_widget.insert("1.0", "\n".join(self.project_config.extra_recipe_sources))
        self.verbose_debug_var.set(self.project_config.verbose_debug_logging)
        self._refresh_all_validations()

    def _refresh_all_validations(self) -> None:
        for key in ("scripts_dir", "mods_dir", "assets_dir", "recipe_db_path"):
            self._update_validation_label(key)
        self._update_multiline_validation("extra_icon_sources")
        self._update_multiline_validation("extra_recipe_sources")
        self._update_settings_summary()

    def _update_settings_summary(self) -> None:
        self.settings_summary.config(
            text=(
                f"Config file: {self.config_store.config_path}\n"
                f"Scripts: {self.settings_vars['scripts_dir'].get() or '—'}\n"
                f"Mods: {self.settings_vars['mods_dir'].get() or '—'}\n"
                f"Assets: {self.settings_vars['assets_dir'].get() or '—'}\n"
                f"Verbose logging: {'on' if self.verbose_debug_var.get() else 'off'}"
            )
        )

    def _path_status_text(self, raw_path: str, expect_file: bool = False) -> tuple[str, str]:
        if not raw_path:
            return ("Не задан", "#b36b00")
        path = Path(raw_path)
        if path.exists():
            if expect_file and path.is_dir():
                return ("Есть, но это папка", "#b36b00")
            return ("OK", "#0b7a0b")
        return ("Не найден", "#b00020")

    def _update_validation_label(self, key: str) -> None:
        expect_file = key == "recipe_db_path"
        status, color = self._path_status_text(self.settings_vars[key].get().strip(), expect_file=expect_file)
        self.validation_labels[key].config(text=status, fg=color)
        self._update_settings_summary()

    def _update_multiline_validation(self, key: str) -> None:
        widget = getattr(self, f"{key}_widget")
        values = [line.strip() for line in widget.get("1.0", tk.END).splitlines() if line.strip()]
        if not values:
            self.validation_labels[key].config(text="Нет дополнительных путей", fg="#666666")
            return
        missing = sum(1 for value in values if not Path(value).exists())
        text = f"{len(values)} path(s), отсутствует: {missing}"
        self.validation_labels[key].config(text=text, fg="#0b7a0b" if missing == 0 else "#b36b00")

    def _browse_path(self, key: str, directory: bool, save_file: bool = False) -> None:
        if directory:
            selected = filedialog.askdirectory(initialdir=self.root_dir)
        elif save_file:
            selected = filedialog.asksaveasfilename(initialdir=self.root_dir, defaultextension=".json")
        else:
            selected = filedialog.askopenfilename(initialdir=self.root_dir)
        if selected:
            self.settings_vars[key].set(selected)

    def _append_multiline_directory(self, key: str) -> None:
        selected = filedialog.askdirectory(initialdir=self.root_dir)
        if not selected:
            return
        widget = getattr(self, f"{key}_widget")
        existing = widget.get("1.0", tk.END).strip()
        updated = f"{existing}\n{selected}" if existing else selected
        widget.delete("1.0", tk.END)
        widget.insert("1.0", updated)
        self._update_multiline_validation(key)

    def _collect_settings_from_form(self) -> PanelProjectConfig:
        extra_icon_sources = [line.strip() for line in self.extra_icon_sources_widget.get("1.0", tk.END).splitlines() if line.strip()]
        extra_recipe_sources = [line.strip() for line in self.extra_recipe_sources_widget.get("1.0", tk.END).splitlines() if line.strip()]
        return PanelProjectConfig(
            scripts_dir=self.settings_vars["scripts_dir"].get().strip() or "scripts",
            mods_dir=self.settings_vars["mods_dir"].get().strip(),
            assets_dir=self.settings_vars["assets_dir"].get().strip(),
            recipe_db_path=self.settings_vars["recipe_db_path"].get().strip(),
            extra_icon_sources=extra_icon_sources,
            extra_recipe_sources=extra_recipe_sources,
            verbose_debug_logging=self.verbose_debug_var.get(),
        )

    def save_settings(self) -> None:
        self.project_config = self._collect_settings_from_form()
        self.config_store.save(self.project_config)
        self._refresh_all_validations()
        self.logger.info("Настройки путей сохранены в %s", self.config_store.config_path)
        self.logger.info("scripts_dir=%s | mods_dir=%s | assets_dir=%s", self.project_config.scripts_dir, self.project_config.mods_dir or "-", self.project_config.assets_dir or "-")
        messagebox.showinfo("Settings", f"Настройки сохранены в:\n{self.config_store.config_path}")

    def reload_settings(self) -> None:
        self.project_config = self.config_store.load()
        self._apply_loaded_settings_to_form()
        self.logger.info("Настройки путей перечитаны из %s", self.config_store.config_path)

    def _log_environment_summary(self) -> None:
        self.logger.info("Панель управления запущена. Корень проекта: %s", self.root_dir)
        self.logger.info("Backend и frontend запускаются внутри этой программы, каждая служба пишет вывод в свою вкладку.")
        self.logger.info("Config paths loaded from %s", self.config_store.config_path)
        self.logger.info("Остановить можно только процессы, которые были запущены этой панелью и всё ещё активны.")

    def _sanitize_console_text(self, text: str) -> str:
        if not text:
            return ""
        text = text.replace("\r\n", "\n").replace("\r", "\n")
        text = ANSI_ESCAPE_RE.sub("", text)
        for source, target in MOJIBAKE_REPLACEMENTS.items():
            text = text.replace(source, target)
        text = text.replace("→", "->").replace("➜", "-")
        return "".join(character for character in text if character == "\n" or character == "\t" or character.isprintable())

    def _write_process_line(self, managed: ManagedProcess, text: str) -> None:
        sanitized = self._sanitize_console_text(text)
        if sanitized:
            managed.console.write_line(sanitized)

    def _poll_process_output(self) -> None:
        for managed in self.managed_processes:
            while True:
                try:
                    chunk = managed.output_queue.get_nowait()
                except queue.Empty:
                    break
                sanitized = self._sanitize_console_text(chunk)
                if sanitized:
                    managed.console.append(sanitized)
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
                self.logger.info("Статус backend изменился: %s.", "работает и может быть остановлен" if backend_running else "остановлен и сейчас нечего останавливать")
            if frontend_running != self._status_snapshot[1]:
                self.logger.info("Статус frontend изменился: %s.", "работает и может быть остановлен" if frontend_running else "остановлен и сейчас нечего останавливать")
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
        self.backend_status.config(text="Backend: работает" if backend_running else "Backend: остановлен")
        self.frontend_status.config(text="Frontend: работает" if frontend_running else "Frontend: остановлен")
        self._set_status_snapshot(backend_running, frontend_running)
        self.root.after(POLL_INTERVAL_MS, self._update_status_labels)

    def _build_backend_command(self) -> tuple[Union[list[str], str], bool]:
        python_executable = self._select_backend_python()
        return [python_executable, "-m", "uvicorn", "app.main:app", "--reload"], False

    def _build_frontend_command(self) -> tuple[Union[list[str], str], bool]:
        if os.name == "nt":
            return ["npm.cmd", "run", "dev"], False
        return ["npm", "run", "dev"], False

    def _show_missing_dir_error(self, name: str, directory: Path) -> None:
        self.logger.error("Запуск %s невозможен: не найдена папка %s", name, directory)
        messagebox.showerror("Ошибка", f"Папка {name} не найдена:\n{directory}")

    def _python_candidates_for_backend(self) -> list[str]:
        candidates: list[str] = []
        if os.name == "nt":
            local_venv = self.backend_dir / ".venv" / "Scripts" / "python.exe"
            if local_venv.exists():
                candidates.append(str(local_venv))
        else:
            local_venv = self.backend_dir / ".venv" / "bin" / "python"
            if local_venv.exists():
                candidates.append(str(local_venv))
        candidates.append(sys.executable)
        for executable in ("python", "python3", "py"):
            resolved = shutil.which(executable)
            if resolved:
                candidates.append(resolved)
        unique_candidates: list[str] = []
        seen: set[str] = set()
        for candidate in candidates:
            if candidate and candidate not in seen:
                seen.add(candidate)
                unique_candidates.append(candidate)
        return unique_candidates

    def _python_has_module(self, python_executable: str, module_name: str) -> bool:
        try:
            result = subprocess.run([
                python_executable,
                "-c",
                f"import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('{module_name}') else 1)",
            ], cwd=self.backend_dir, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
        except OSError:
            return False
        return result.returncode == 0

    def _show_backend_dependency_error(self, checked_candidates: list[str]) -> None:
        preferred_python = checked_candidates[0] if checked_candidates else sys.executable
        install_command = f'"{preferred_python}" -m pip install -e backend[dev]'
        details = "\n".join(f"- {candidate}" for candidate in checked_candidates) or "- candidates not found"
        message = (
            "Не найден модуль uvicorn ни в одном подходящем Python-интерпретаторе.\n\n"
            "Проверьте backend-окружение и установите зависимости, например так:\n"
            f"{install_command}\n\n"
            "Проверенные интерпретаторы:\n"
            f"{details}"
        )
        self.logger.error(message.replace("\n", " "))
        self._write_process_line(self.backend, f"Backend не запущен: в выбранном Python отсутствует модуль uvicorn.\nУстановите зависимости командой:\n{install_command}\n")
        messagebox.showerror("Ошибка backend", message)

    def _select_backend_python(self) -> str:
        checked_candidates = self._python_candidates_for_backend()
        for candidate in checked_candidates:
            if self._python_has_module(candidate, "uvicorn"):
                self.logger.info("Для backend выбран Python-интерпретатор с установленным uvicorn: %s", candidate)
                return candidate
        self._show_backend_dependency_error(checked_candidates)
        raise RuntimeError("uvicorn is not installed in any detected Python interpreter")

    def _validate_backend_setup(self) -> bool:
        if not self.backend_dir.is_dir():
            self._show_missing_dir_error("backend", self.backend_dir)
            return False
        try:
            self._select_backend_python()
        except RuntimeError:
            return False
        return True

    def _validate_frontend_setup(self) -> bool:
        package_json = self.frontend_dir / "package.json"
        node_modules = self.frontend_dir / "node_modules"
        if not package_json.is_file():
            self.logger.error("Frontend не может быть запущен: отсутствует файл %s", package_json)
            messagebox.showerror("Ошибка frontend", f"Не найден файл frontend/package.json:\n{package_json}")
            return False
        if not node_modules.is_dir():
            self.logger.error("Frontend не может быть запущен: отсутствует папка node_modules. Сначала выполните npm install в %s", self.frontend_dir)
            messagebox.showerror("Ошибка frontend", "Frontend зависимости не установлены.\n" f"Выполните npm install в папке:\n{self.frontend_dir}")
            return False
        return True

    def _describe_command(self, command: Union[list[str], str]) -> str:
        return " ".join(command) if isinstance(command, list) else command


    def _emit_panel_log_event(self, level: str, category: str, message: str, details: Optional[dict[str, Any]] = None) -> None:
        try:
            self._request_debug_json('/api/debug/log', method='POST', payload={
                'source': 'CONTROL_PANEL',
                'level': level,
                'category': category,
                'message': message,
                'details': details or {},
                'verbose_only': False,
            })
        except Exception:
            pass

    def test_debug_pipeline(self) -> None:
        details = {'test': 'control-panel-pipeline', 'note': 'synthetic frontend-like event from control panel'}
        try:
            post_response = self._request_debug_json('/api/debug/log', method='POST', payload={
                'source': 'FRONTEND',
                'level': 'INFO',
                'category': 'UI',
                'message': 'Test Debug Pipeline event',
                'details': details,
                'verbose_only': False,
            })
            get_response = self._request_debug_json('/api/debug/log?source=All&level=All')
            export_text = get_response.get('exportText', '')
            if 'Test Debug Pipeline event' not in export_text:
                raise RuntimeError('backend buffer empty or event not found after ingest')
            self.full_log_pane.set_status(f"Pipeline OK | url={get_response.get('_request', {}).get('url')} | status={get_response.get('_request', {}).get('status')}")
            self._emit_panel_log_event('INFO', 'UI', 'Test Debug Pipeline succeeded', {'post': post_response.get('_request'), 'get': get_response.get('_request')})
            self.refresh_unified_log()
        except Exception as error:
            self.full_log_pane.set_status(f'Pipeline broken: {error}')
            self.logger.error('Test Debug Pipeline failed: %s', error)


    def refresh_unified_log(self) -> None:
        path = f"/api/debug/log?source={self.full_log_pane.source_var.get()}&level={self.full_log_pane.level_var.get()}"
        try:
            payload = self._request_debug_json(path)
            self.full_log_pane.render(payload.get('exportText', ''))
            request_info = payload.get('_request', {})
            self.full_log_pane.set_status(f"URL: {request_info.get('url')} | status: {request_info.get('status')} | events: {len(payload.get('events', []))}")
        except Exception as error:
            self.full_log_pane.set_status(f"Unified log refresh failed | URL: {BACKEND_API_BASE_URL}{path} | error: {error}")
            self.logger.error('Не удалось обновить unified log: %s', error)
            self._emit_panel_log_event('ERROR', 'API', 'Unified log refresh failed', {'url': f'{BACKEND_API_BASE_URL}{path}', 'error': str(error)})

    def copy_unified_log(self) -> None:
        self.full_log_pane.copy_all()
        self.logger.info('Unified log copied to clipboard.')
        self._emit_panel_log_event('INFO', 'UI', 'Copy Full Log clicked', {'length': len(self.full_log_pane.current_text)})

    def save_unified_log(self) -> None:
        path = self.full_log_pane.save_to_file(self.root_dir)
        if path:
            self.logger.info('Unified log saved to %s', path)
            self._emit_panel_log_event('INFO', 'UI', 'Save Log To File clicked', {'path': path})

    def clear_unified_log(self) -> None:
        try:
            self._request_debug_json('/api/debug/log/clear', method='POST')
        except Exception as error:
            self.logger.error('Не удалось очистить unified log: %s', error)
        self.full_log_pane.clear()
        self._emit_panel_log_event('INFO', 'UI', 'Clear Log clicked', {})

    def _poll_unified_log(self) -> None:
        if self.backend.is_running() or self.full_log_pane.current_text:
            self.refresh_unified_log()
        self.root.after(1500, self._poll_unified_log)

    def _request_debug_json(self, path: str, method: str = "GET", payload: Optional[dict[str, Any]] = None) -> dict[str, Any]:
        url = f"{BACKEND_API_BASE_URL}{path}"
        body = None if payload is None else json.dumps(payload).encode('utf-8')
        headers = {} if payload is None else {'Content-Type': 'application/json'}
        request = Request(url, data=body, headers=headers, method=method)
        try:
            with urlopen(request, timeout=10) as response:
                raw_body = response.read().decode('utf-8')
                parsed = json.loads(raw_body) if raw_body else {}
                if isinstance(parsed, dict):
                    parsed['_request'] = {'url': url, 'status': response.status, 'body': raw_body[:800]}
                return parsed if isinstance(parsed, dict) else {'data': parsed, '_request': {'url': url, 'status': response.status, 'body': raw_body[:800]}}
        except HTTPError as error:
            error_body = error.read().decode('utf-8', errors='replace')
            raise RuntimeError(f'HTTP {error.code} for {url} body={error_body[:800]}') from error
        except URLError as error:
            raise RuntimeError(f'URL error for {url}: {error}') from error

    def refresh_debug_info(self) -> None:
        try:
            payload = self._request_debug_json('/api/debug/summary')
            self.debug_pane.render(payload)
            self.notebook.select(self.debug_pane.frame)
            self.logger.info('Debug summary refreshed from backend /api/debug/summary')
        except (URLError, HTTPError, TimeoutError, json.JSONDecodeError) as error:
            self.logger.error('Не удалось обновить debug summary: %s', error)
            messagebox.showerror('Debug', f'Не удалось получить debug summary from backend:\n{error}')

    def rescan_debug_recipes(self) -> None:
        try:
            self._request_debug_json('/api/debug/recipes/rescan', method='POST')
            self.refresh_debug_info()
            self.logger.info('Recipe diagnostics refreshed via /api/debug/recipes/rescan')
        except (URLError, HTTPError, TimeoutError, json.JSONDecodeError) as error:
            self.logger.error('Не удалось пересканировать recipes debug: %s', error)
            messagebox.showerror('Debug', f'Не удалось пересканировать recipes:\n{error}')

    def rescan_debug_assets(self) -> None:
        try:
            self._request_debug_json('/api/debug/assets/rescan', method='POST')
            self.refresh_debug_info()
            self.logger.info('Asset diagnostics refreshed via /api/debug/assets/rescan')
        except (URLError, HTTPError, TimeoutError, json.JSONDecodeError) as error:
            self.logger.error('Не удалось пересканировать assets debug: %s', error)
            messagebox.showerror('Debug', f'Не удалось пересканировать assets:\n{error}')

    def clear_debug_log(self) -> None:
        try:
            self._request_debug_json('/api/debug/clear', method='POST')
        except (URLError, HTTPError, TimeoutError, json.JSONDecodeError) as error:
            self.logger.error('Не удалось очистить backend debug log: %s', error)
        self.debug_pane.clear()
        self.logger.info('Debug pane cleared by user request.')

    def _build_process_env(self) -> dict[str, str]:
        env = os.environ.copy()
        env.setdefault("PYTHONIOENCODING", "utf-8")
        env["FORCE_COLOR"] = "0"
        env["NO_COLOR"] = "1"
        env["CLICOLOR"] = "0"
        env["npm_config_color"] = "false"
        env["CUBIXRECIPES_CONFIG"] = str(self.config_store.config_path)
        return env

    def _start_process(self, managed: ManagedProcess, command: Union[list[str], str], use_shell: bool) -> None:
        if self.is_running(managed):
            self.logger.info("%s уже запущен, поэтому повторный старт пропущен. Этот процесс можно остановить кнопкой Stop %s.", managed.name.capitalize(), managed.name.capitalize())
            return
        if not managed.directory.is_dir():
            self._show_missing_dir_error(managed.name, managed.directory)
            return
        managed.reset_output()
        managed.last_return_code = None
        self._write_process_line(managed, f"$ {self._describe_command(command)}")
        self.logger.info("Запускаю %s внутри встроенной вкладки-консоли. Рабочая папка: %s. Команда: %s", managed.name, managed.directory, self._describe_command(command))
        self.logger.info("Для запуска будет использован конфиг путей: %s", self.config_store.config_path)
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
                encoding="utf-8",
                errors="replace",
                env=self._build_process_env(),
            )
            managed.reader_thread = threading.Thread(target=self._stream_process_output, args=(managed,), daemon=True)
            managed.reader_thread.start()
            self.logger.info("%s успешно запущен (pid=%s). Вывод доступен во вкладке %s.", managed.name.capitalize(), managed.proc.pid, managed.console.frame.master.tab(managed.console.frame, 'text'))
        except OSError as error:
            managed.proc = None
            self.logger.exception("Не удалось запустить %s: %s", managed.name, error)
            messagebox.showerror("Ошибка запуска", f"Не удалось запустить {managed.name}:\n{error}")

    def start_backend(self) -> None:
        if not self._validate_backend_setup():
            return
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
            self.logger.info("%s уже остановлен или не запускался из панели, поэтому останавливать сейчас нечего.", managed.name.capitalize())
            return
        self.logger.info("Останавливаю %s по запросу из панели. Сначала отправляется мягкое завершение процесса.", managed.name)
        self._write_process_line(managed, "\n[stop requested]\n")
        try:
            assert managed.proc is not None
            managed.proc.terminate()
            managed.proc.wait(timeout=3)
            self.logger.info("%s остановлен корректно.", managed.name.capitalize())
            self._write_process_line(managed, "[stopped gracefully]\n")
        except Exception:
            self.logger.warning("%s не завершился вовремя после terminate(), поэтому будет выполнен kill().", managed.name.capitalize())
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
        self.logger.info("Перезапуск всех сервисов: сначала полная остановка, затем общий старт через %sms.", RESTART_ALL_DELAY_MS)
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
