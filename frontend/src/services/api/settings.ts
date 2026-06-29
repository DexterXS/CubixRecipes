import { ProjectSettings, UiPreferences } from '../../types';
import { apiPath, request } from './client';

export async function getProjectSettings(): Promise<ProjectSettings> {
  return request<ProjectSettings>(apiPath('/settings/project'));
}

export async function updateProjectSettings(settings: ProjectSettings): Promise<ProjectSettings> {
  return request<ProjectSettings>(apiPath('/settings/project'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scripts_dir: settings.scripts_dir,
      mods_dir: settings.mods_dir || '',
      assets_dir: settings.assets_dir || '',
      recipe_db_path: settings.recipe_db_path || '',
      extra_icon_sources: settings.extra_icon_sources || [],
      extra_recipe_sources: settings.extra_recipe_sources || [],
      verbose_debug_logging: Boolean(settings.verbose_debug_logging)
    })
  });
}

export async function updateProjectUiPreferences(uiPreferences: UiPreferences): Promise<ProjectSettings> {
  return request<ProjectSettings>(apiPath('/settings/project/ui'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(uiPreferences)
  });
}
