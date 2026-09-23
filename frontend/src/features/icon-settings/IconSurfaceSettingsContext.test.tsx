import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultIconSurfaceSettings, defaultMobileIconSurfaceSettings } from './iconSurfaces';
import { IconSurfaceSettingsHost } from './IconSurfaceSettingsHost';
import { IconSurfaceSettingsProvider, useIconSurfaceSettings } from './IconSurfaceSettingsContext';

function Harness() {
  const settings = useIconSurfaceSettings();
  return (
    <>
      <IconSurfaceSettingsHost surfaceId="nei" />
      <IconSurfaceSettingsHost surfaceId="favorites" />
      <output data-testid="dirty">{String(settings.isDirty)}</output>
    </>
  );
}

describe('IconSurfaceSettingsProvider', () => {
  afterEach(() => cleanup());

  it('applies changes live and restores the saved snapshot on cancel', async () => {
    const onLiveChange = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <IconSurfaceSettingsProvider desktopSettings={defaultIconSurfaceSettings} mobileSettings={defaultMobileIconSurfaceSettings} onLiveChange={onLiveChange} onSave={onSave}>
        <Harness />
      </IconSurfaceSettingsProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Настроить иконки: nei' }));
    fireEvent.change(screen.getByLabelText('icon-nei-padding'), { target: { value: '8' } });

    expect(onLiveChange).toHaveBeenLastCalledWith('desktop', expect.objectContaining({ nei: expect.objectContaining({ padding: 8 }) }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onLiveChange).toHaveBeenLastCalledWith('desktop', expect.objectContaining({ nei: expect.objectContaining({ padding: 0 }) }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('saves the live profile explicitly and closes after success', async () => {
    const onLiveChange = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <IconSurfaceSettingsProvider desktopSettings={defaultIconSurfaceSettings} mobileSettings={defaultMobileIconSurfaceSettings} onLiveChange={onLiveChange} onSave={onSave}>
        <Harness />
      </IconSurfaceSettingsProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Настроить иконки: nei' }));
    fireEvent.change(screen.getByLabelText('icon-nei-offset-x'), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить глобально' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith('desktop', expect.objectContaining({ nei: expect.objectContaining({ offsetX: 6 }) })));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('restores the previous surface before opening another menu', () => {
    const onLiveChange = vi.fn();
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <IconSurfaceSettingsProvider desktopSettings={defaultIconSurfaceSettings} mobileSettings={defaultMobileIconSurfaceSettings} onLiveChange={onLiveChange} onSave={onSave}>
        <Harness />
      </IconSurfaceSettingsProvider>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Настроить иконки: nei' }));
    fireEvent.change(screen.getByLabelText('icon-nei-padding'), { target: { value: '8' } });
    fireEvent.click(screen.getByRole('button', { name: 'Настроить иконки: favorites' }));
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    expect(onLiveChange).toHaveBeenLastCalledWith('desktop', expect.objectContaining({
      nei: expect.objectContaining({ padding: 0 }),
      favorites: expect.objectContaining({ padding: 0 })
    }));
  });
});
