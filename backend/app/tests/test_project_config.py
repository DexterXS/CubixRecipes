from pathlib import Path

from app.config.project_config import ProjectConfigService


def test_project_config_uses_configured_data_dir_for_runtime_defaults(tmp_path: Path, monkeypatch):
    data_dir = tmp_path / 'data'
    monkeypatch.setenv('CUBIXRECIPES_DATA_DIR', str(data_dir))
    monkeypatch.delenv('RAILWAY_VOLUME_MOUNT_PATH', raising=False)

    service = ProjectConfigService()
    config = service.load()

    assert service.config_path == data_dir / 'cubixrecipes.config.json'
    assert config.scripts_dir == str(data_dir / 'scripts')
    assert config.project_config_path == str(data_dir / 'cubixrecipes.config.json')
    assert (data_dir / 'cubixrecipes.config.json').is_file()
    assert (data_dir / 'scripts').is_dir()
