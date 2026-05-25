from __future__ import annotations

import os
import re
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path
from typing import Optional

import psutil
import requests
from PySide6.QtCore import QProcess, QTimer, Qt, Signal
from PySide6.QtGui import QCursor
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QProgressBar,
    QPushButton,
    QSizePolicy,
    QSplitter,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)


BACKEND_PANEL_RELOAD = os.environ.get("CUBIXRECIPES_PANEL_BACKEND_RELOAD", "0") == "1"
BACKEND_URL = "http://127.0.0.1:8000"
FRONTEND_URL = "http://localhost:5173"
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
ANSI_ESCAPE_RE = re.compile(r"\x1B(?:[@-Z\-_]|\[[0-?]*[ -/]*[@-~])")


MODERN_STYLE = """
QMainWindow {
    background-color: #0b0f19;
}
QWidget#mainContent {
    background: qradialgradient(cx:0.5, cy:0, radius:1.2, fx:0.5, fy:0, stop:0 #1e293b, stop:1 #0b1220);
}
QFrame#card, QFrame#statusCard {
    background-color: rgba(30, 41, 59, 0.62);
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 16px;
}
QLabel#title {
    font-size: 26px;
    font-weight: 700;
    color: #f8fafc;
}
QLabel#subtitle {
    font-size: 13px;
    color: #94a3b8;
}
QPushButton {
    background-color: rgba(51, 65, 85, 0.72);
    color: #e2e8f0;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 10px;
    padding: 8px 14px;
    font-weight: 600;
}
QPushButton:hover {
    background-color: rgba(71, 85, 105, 0.82);
}
QPushButton#actionButton {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #3b82f6, stop:1 #2563eb);
    border: none;
    color: white;
}
QPushButton#stopButton {
    background: qlineargradient(x1:0, y1:0, x2:0, y2:1, stop:0 #ef4444, stop:1 #dc2626);
    border: none;
    color: white;
}
QPushButton:disabled {
    color: #64748b;
    background-color: rgba(30, 41, 59, 0.45);
}
QTextEdit#console {
    background-color: rgba(15, 23, 42, 0.78);
    border: 1px solid rgba(148, 163, 184, 0.10);
    border-radius: 14px;
    color: #cbd5e1;
    font-family: Consolas, monospace;
    font-size: 12px;
    padding: 10px;
}
QProgressBar {
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 7px;
    background-color: rgba(15, 23, 42, 0.78);
    color: #e2e8f0;
    text-align: center;
    min-height: 16px;
}
QProgressBar::chunk {
    border-radius: 6px;
    background-color: #3b82f6;
}
"""


def is_project_root(path: Path) -> bool:
    return (path / "backend").is_dir() and (path / "frontend").is_dir()


def resolve_project_root() -> Path:
    candidates: list[Path] = []
    if getattr(sys, "frozen", False):
        candidates.append(Path(sys.executable).resolve().parent)
        mei = getattr(sys, "_MEIPASS", None)
        if mei:
            candidates.append(Path(mei).resolve())
    candidates.append(Path(__file__).resolve().parent)
    candidates.append(Path.cwd())
    for candidate in list(candidates):
        candidates.extend(candidate.parents)
    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        if is_project_root(candidate):
            return candidate
    return Path(__file__).resolve().parent


class ProcessController(QProcess):
    output_ready = Signal(str, str)

    def __init__(self, name: str) -> None:
        super().__init__()
        self.name = name
        self.stop_requested = False
        self.setProcessChannelMode(QProcess.MergedChannels)
        environment = self.processEnvironment()
        environment.insert("PYTHONIOENCODING", "utf-8")
        environment.insert("PYTHONUTF8", "1")
        environment.insert("PYTHONUNBUFFERED", "1")
        environment.insert("NO_COLOR", "1")
        self.setProcessEnvironment(environment)
        self.readyReadStandardOutput.connect(self._handle_output)

    def _handle_output(self) -> None:
        data = bytes(self.readAllStandardOutput().data()).decode("utf-8", errors="replace")
        self.output_ready.emit(data, self.name)


class PortKiller:
    @staticmethod
    def is_port_bindable(port: int) -> bool:
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                sock.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False

    @staticmethod
    def busy_pids(port: int) -> set[int]:
        pids: set[int] = set()
        try:
            for conn in psutil.net_connections(kind="inet"):
                if conn.pid and conn.laddr and conn.laddr.port == port:
                    pids.add(int(conn.pid))
        except Exception:
            pass
        return pids

    @staticmethod
    def kill_port(port: int) -> str:
        pids = {pid for pid in PortKiller.busy_pids(port) if pid != os.getpid()}
        if not pids:
            return f"Port {port} is already free."
        for pid in pids:
            try:
                parent = psutil.Process(pid)
                for child in parent.children(recursive=True):
                    child.kill()
                parent.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if PortKiller.is_port_bindable(port):
                return f"Freed port {port}; killed pids: {', '.join(map(str, sorted(pids)))}."
            time.sleep(0.25)
        return f"Requested kill for pids {', '.join(map(str, sorted(pids)))}, but port {port} is still busy."


class AdminPanel(QMainWindow):
    def __init__(self) -> None:
        super().__init__()
        self.setWindowTitle("CubixRecipes Admin")
        self.resize(1180, 820)
        self.root_dir = resolve_project_root()
        self.backend_proc = ProcessController("backend")
        self.frontend_proc = ProcessController("frontend")
        self.atlas_proc: Optional[QProcess] = None
        self.api_session = requests.Session()

        self.backend_proc.started.connect(lambda: self._handle_started(self.backend_proc, self.backend_btn))
        self.frontend_proc.started.connect(lambda: self._handle_started(self.frontend_proc, self.frontend_btn))
        self.backend_proc.finished.connect(lambda *_args: self._handle_finished(self.backend_proc, self.backend_btn))
        self.frontend_proc.finished.connect(lambda *_args: self._handle_finished(self.frontend_proc, self.frontend_btn))
        self.backend_proc.output_ready.connect(self._append_log)
        self.frontend_proc.output_ready.connect(self._append_log)

        self._setup_ui()
        self.setStyleSheet(MODERN_STYLE)

        self.status_timer = QTimer(self)
        self.status_timer.timeout.connect(self._update_status)
        self.status_timer.start(1000)

    def _setup_ui(self) -> None:
        root = QWidget()
        root.setObjectName("mainContent")
        self.setCentralWidget(root)
        layout = QVBoxLayout(root)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(14)

        header = QFrame()
        header.setObjectName("card")
        header_layout = QHBoxLayout(header)
        title_box = QVBoxLayout()
        title = QLabel("CubixRecipes Admin")
        title.setObjectName("title")
        subtitle = QLabel(f"Project: {self.root_dir}")
        subtitle.setObjectName("subtitle")
        title_box.addWidget(title)
        title_box.addWidget(subtitle)
        header_layout.addLayout(title_box, 1)
        self.api_status = QLabel("API: checking...")
        self.api_status.setObjectName("subtitle")
        header_layout.addWidget(self.api_status)
        for text, callback in [
            ("Open App", lambda: webbrowser.open(FRONTEND_URL)),
            ("Restart Panel", self._restart_self),
            ("Free :8000", self._kill_backend_port),
        ]:
            button = QPushButton(text)
            button.clicked.connect(callback)
            header_layout.addWidget(button)
        layout.addWidget(header)

        cards = QHBoxLayout()
        self.backend_card, self.backend_status, self.backend_btn = self._create_status_card(
            "Backend", "FastAPI service on 127.0.0.1:8000", self._toggle_backend
        )
        self.frontend_card, self.frontend_status, self.frontend_btn = self._create_status_card(
            "Frontend", "Vite UI on localhost:5173", self._toggle_frontend
        )
        cards.addWidget(self.backend_card)
        cards.addWidget(self.frontend_card)
        layout.addLayout(cards)

        atlas_card = QFrame()
        atlas_card.setObjectName("statusCard")
        atlas_layout = QHBoxLayout(atlas_card)
        atlas_title = QLabel("Itempanel Atlas")
        atlas_title.setStyleSheet("font-weight: 700; color: #f8fafc;")
        self.atlas_btn = QPushButton("Rebuild Atlas")
        self.atlas_btn.clicked.connect(self._rebuild_itempanel_atlas)
        self.atlas_progress = QProgressBar()
        self.atlas_progress.setRange(0, 100)
        self.atlas_progress.setValue(0)
        self.atlas_status = QLabel("Ready")
        self.atlas_status.setObjectName("subtitle")
        atlas_layout.addWidget(atlas_title)
        atlas_layout.addWidget(self.atlas_btn)
        atlas_layout.addWidget(self.atlas_progress)
        atlas_layout.addWidget(self.atlas_status, 1)
        layout.addWidget(atlas_card)

        splitter = QSplitter(Qt.Horizontal)
        self.backend_console = self._create_console("Backend Console")
        self.frontend_console = self._create_console("Frontend Console")
        splitter.addWidget(self.backend_console)
        splitter.addWidget(self.frontend_console)
        splitter.setSizes([1, 1])
        layout.addWidget(splitter, 1)

        self.unified_console = self._create_console("Action Log")
        self.unified_console.setMaximumHeight(150)
        layout.addWidget(self.unified_console)
        self._log(f"Admin panel ready. Root: {self.root_dir}")

    def _create_status_card(self, title: str, subtitle: str, callback: object) -> tuple[QFrame, QLabel, QPushButton]:
        card = QFrame()
        card.setObjectName("statusCard")
        layout = QVBoxLayout(card)
        label = QLabel(title)
        label.setStyleSheet("font-size: 18px; font-weight: 700; color: #f8fafc;")
        sub = QLabel(subtitle)
        sub.setObjectName("subtitle")
        status = QLabel("Stopped")
        status.setStyleSheet("font-size: 16px; color: #fca5a5;")
        button = QPushButton(f"Start {title}")
        button.setObjectName("actionButton")
        button.setCursor(QCursor(Qt.PointingHandCursor))
        button.clicked.connect(callback)
        layout.addWidget(label)
        layout.addWidget(sub)
        layout.addStretch(1)
        layout.addWidget(status)
        layout.addWidget(button)
        return card, status, button

    def _create_console(self, title: str) -> QTextEdit:
        console = QTextEdit()
        console.setObjectName("console")
        console.setReadOnly(True)
        console.setPlaceholderText(title)
        console.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        return console

    def _python_candidates(self) -> list[str]:
        candidates: list[Path | str] = []
        if os.name == "nt":
            candidates.append(self.root_dir / "backend" / ".venv" / "Scripts" / "python.exe")
            candidates.append(self.root_dir / "venv" / "Scripts" / "python.exe")
        else:
            candidates.append(self.root_dir / "backend" / ".venv" / "bin" / "python")
            candidates.append(self.root_dir / "venv" / "bin" / "python")
        candidates.append(sys.executable)
        result: list[str] = []
        seen: set[str] = set()
        for candidate in candidates:
            path = str(candidate)
            if path not in seen and (candidate == sys.executable or Path(path).exists()):
                seen.add(path)
                result.append(path)
        return result

    def _select_backend_python(self) -> str:
        for candidate in self._python_candidates():
            try:
                check = subprocess.run(
                    [candidate, "-c", "import importlib.util, sys; sys.exit(0 if importlib.util.find_spec('uvicorn') else 1)"],
                    cwd=self.root_dir,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=CREATE_NO_WINDOW,
                    check=False,
                )
                if check.returncode == 0:
                    return candidate
            except OSError:
                continue
        return sys.executable

    def _build_env(self) -> list[str]:
        env = self.backend_proc.processEnvironment()
        env.insert("CUBIXRECIPES_CONFIG", str(self.root_dir / "cubixrecipes.config.json"))
        env.insert("PYTHONIOENCODING", "utf-8")
        env.insert("PYTHONUNBUFFERED", "1")
        env.insert("NO_COLOR", "1")
        return env

    def _toggle_backend(self) -> None:
        if self.backend_proc.state() != QProcess.NotRunning:
            self._request_stop(self.backend_proc)
            return
        backend_dir = self.root_dir / "backend"
        if not backend_dir.is_dir():
            self._log(f"Backend directory not found: {backend_dir}")
            return
        if not PortKiller.is_port_bindable(8000):
            self._log(PortKiller.kill_port(8000))
        python_exe = self._select_backend_python()
        args = ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"]
        if BACKEND_PANEL_RELOAD:
            args.append("--reload")
        self.backend_console.clear()
        self.backend_proc.setWorkingDirectory(str(backend_dir))
        self.backend_proc.setProcessEnvironment(self._build_env())
        self._log(f"Starting backend: {python_exe} {' '.join(args)}")
        self.backend_proc.start(python_exe, args)

    def _toggle_frontend(self) -> None:
        if self.frontend_proc.state() != QProcess.NotRunning:
            self._request_stop(self.frontend_proc)
            return
        frontend_dir = self.root_dir / "frontend"
        if not frontend_dir.is_dir():
            self._log(f"Frontend directory not found: {frontend_dir}")
            return
        command = "npm.cmd" if os.name == "nt" else "npm"
        self.frontend_console.clear()
        self.frontend_proc.setWorkingDirectory(str(frontend_dir))
        self._log("Starting frontend: npm run dev")
        self.frontend_proc.start(command, ["run", "dev"])

    def _request_stop(self, proc: ProcessController) -> None:
        proc.stop_requested = True
        self._log(f"Stopping {proc.name}...")
        self._terminate_process_tree(proc)
        QTimer.singleShot(3000, lambda: self._kill_if_running(proc))

    def _terminate_process_tree(self, proc: ProcessController) -> None:
        pid = int(proc.processId())
        if pid <= 0:
            proc.terminate()
            return
        try:
            parent = psutil.Process(pid)
            for child in parent.children(recursive=True):
                child.terminate()
            parent.terminate()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            proc.terminate()

    def _kill_if_running(self, proc: ProcessController) -> None:
        if proc.state() == QProcess.NotRunning:
            return
        pid = int(proc.processId())
        try:
            parent = psutil.Process(pid)
            for child in parent.children(recursive=True):
                child.kill()
            parent.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            proc.kill()

    def _handle_started(self, proc: ProcessController, button: QPushButton) -> None:
        proc.stop_requested = False
        button.setText(f"Stop {proc.name.capitalize()}")
        button.setObjectName("stopButton")
        button.style().unpolish(button)
        button.style().polish(button)
        self._log(f"{proc.name.capitalize()} started.")

    def _handle_finished(self, proc: ProcessController, button: QPushButton) -> None:
        button.setText(f"Start {proc.name.capitalize()}")
        button.setObjectName("actionButton")
        button.style().unpolish(button)
        button.style().polish(button)
        self._log(f"{proc.name.capitalize()} stopped.")

    def _append_log(self, text: str, channel: str) -> None:
        clean = ANSI_ESCAPE_RE.sub("", text).replace("\r\n", "\n").replace("\r", "\n")
        console = self.backend_console if channel == "backend" else self.frontend_console
        console.append(clean.rstrip())
        self.unified_console.append(f"[{channel}] {clean.rstrip()}")

    def _log(self, text: str) -> None:
        self.unified_console.append(text)

    def _update_status(self) -> None:
        backend_running = self.backend_proc.state() != QProcess.NotRunning
        frontend_running = self.frontend_proc.state() != QProcess.NotRunning
        self.backend_status.setText("Running" if backend_running else "Stopped")
        self.backend_status.setStyleSheet(f"font-size: 16px; color: {'#86efac' if backend_running else '#fca5a5'};")
        self.frontend_status.setText("Running" if frontend_running else "Stopped")
        self.frontend_status.setStyleSheet(f"font-size: 16px; color: {'#86efac' if frontend_running else '#fca5a5'};")
        try:
            response = self.api_session.get(f"{BACKEND_URL}/health", timeout=0.8)
            ok = response.status_code == 200
        except requests.RequestException:
            ok = False
        self.api_status.setText("API: ONLINE" if ok else "API: OFFLINE")
        self.api_status.setStyleSheet(f"color: {'#86efac' if ok else '#fca5a5'};")

    def _kill_backend_port(self) -> None:
        self._log(PortKiller.kill_port(8000))

    def _restart_self(self) -> None:
        self._log("Restarting admin panel...")
        QProcess.startDetached(sys.executable, [str(Path(__file__).resolve())], str(self.root_dir))
        QApplication.quit()

    def _rebuild_itempanel_atlas(self) -> None:
        script_path = self.root_dir / "backend" / "scripts" / "generate_itempanel_atlas.py"
        if not script_path.is_file():
            self.atlas_status.setText(f"Script not found: {script_path}")
            return
        if self.atlas_proc is not None and self.atlas_proc.state() != QProcess.NotRunning:
            return
        self.atlas_proc = QProcess(self)
        self.atlas_proc.setProcessChannelMode(QProcess.MergedChannels)
        self.atlas_proc.setWorkingDirectory(str(self.root_dir))
        self.atlas_proc.readyReadStandardOutput.connect(self._read_atlas_output)
        self.atlas_proc.started.connect(self._atlas_started)
        self.atlas_proc.finished.connect(self._atlas_finished)
        self.atlas_proc.start(sys.executable, [str(script_path)])

    def _atlas_started(self) -> None:
        self.atlas_btn.setEnabled(False)
        self.atlas_progress.setRange(0, 0)
        self.atlas_status.setText("Rebuilding...")
        self._log("[atlas] rebuild started")

    def _read_atlas_output(self) -> None:
        if self.atlas_proc is None:
            return
        text = bytes(self.atlas_proc.readAllStandardOutput().data()).decode("utf-8", errors="replace").strip()
        if text:
            self._log(f"[atlas] {text}")

    def _atlas_finished(self, exit_code: int, _exit_status: QProcess.ExitStatus) -> None:
        self.atlas_btn.setEnabled(True)
        self.atlas_progress.setRange(0, 100)
        self.atlas_progress.setValue(100 if exit_code == 0 else 0)
        if exit_code == 0:
            self.atlas_status.setText("Done. Reload frontend to use the new atlas.")
            self._log("[atlas] rebuild finished")
            return
        self.atlas_status.setText(f"Failed with code {exit_code}")
        self._log(f"[atlas] rebuild failed with code {exit_code}")

    def closeEvent(self, event) -> None:  # type: ignore[override]
        self.status_timer.stop()
        self.api_session.close()
        for proc in (self.backend_proc, self.frontend_proc, self.atlas_proc):
            if proc is not None and proc.state() != QProcess.NotRunning:
                proc.kill()
        super().closeEvent(event)


def main() -> int:
    app = QApplication(sys.argv)
    window = AdminPanel()
    window.show()
    return app.exec()


if __name__ == "__main__":
    raise SystemExit(main())
