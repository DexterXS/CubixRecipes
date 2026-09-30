import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { getFastItemPanelPage, type FastItemPanelPage } from '../../services/api/fastItemPanel';
import { FastItemPanel } from './FastItemPanel';

vi.mock('../../services/api/fastItemPanel', () => {
  return {
    FAST_ITEM_PANEL_LIMIT: 48,
    getFastItemPanelPage: vi.fn()
  };
});

const getPageMock = vi.mocked(getFastItemPanelPage);

function page(items: FastItemPanelPage['items'], total: number, currentPage = 1): FastItemPanelPage {
  return { items, page: currentPage, limit: 48, total };
}

function item(raw: string, displayName = raw): FastItemPanelPage['items'][number] {
  return {
    raw,
    display_name: displayName,
    icon: { mime: 'image/png', data: 'AAAA' }
  };
}

beforeEach(() => {
  getPageMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

test('renders page items as data URL images and exposes pick, hover, and drag raw callbacks', async () => {
  getPageMock.mockResolvedValue(page([item('<minecraft:stone>', 'Камень')], 1));
  const onPick = vi.fn();
  const onHover = vi.fn();

  render(<FastItemPanel onPick={onPick} onHover={onHover} />);

  const itemButton = await screen.findByRole('button', { name: 'Выбрать Камень' });
  expect(screen.getByText('NEI предметы')).toBeTruthy();
  expect(screen.getByText('Общая база изображений')).toBeTruthy();
  expect(screen.getByLabelText('Поиск предмета')).toBeTruthy();
  expect(screen.getByText('1/1')).toBeTruthy();
  expect(itemButton.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,AAAA');

  fireEvent.mouseEnter(itemButton);
  fireEvent.click(itemButton);
  expect(onHover).toHaveBeenCalledWith('<minecraft:stone>');
  expect(onPick).toHaveBeenCalledWith('<minecraft:stone>');

  const dataTransfer = { effectAllowed: '', setData: vi.fn() };
  fireEvent.dragStart(itemButton, { dataTransfer });
  expect(dataTransfer.setData).toHaveBeenCalledWith('text/plain', '<minecraft:stone>');
});

test('debounces search and keeps pagination at the requested page', async () => {
  getPageMock
    .mockResolvedValueOnce(page([item('<minecraft:stone>')], 97))
    .mockResolvedValueOnce(page([item('<minecraft:iron_ingot>')], 97))
    .mockResolvedValueOnce(page([item('<minecraft:gold_ingot>')], 97, 2));

  render(<FastItemPanel onPick={vi.fn()} onHover={vi.fn()} serverId="hitech" />);
  await screen.findByRole('button', { name: 'Выбрать <minecraft:stone>' });

  fireEvent.change(screen.getByLabelText('Поиск предмета'), { target: { value: 'iron' } });
  await waitFor(() => expect(getPageMock).toHaveBeenLastCalledWith({ page: 1, limit: 48, q: 'iron', serverId: 'hitech' }));
  expect(getPageMock).toHaveBeenCalledTimes(2);
  expect(screen.getByRole('button', { name: 'Выбрать <minecraft:iron_ingot>' })).toBeTruthy();

  getPageMock.mockResolvedValueOnce(page([item('<minecraft:gold_ingot>')], 97, 2));
  fireEvent.click(screen.getByRole('button', { name: 'Следующая страница' }));
  await waitFor(() => expect(getPageMock).toHaveBeenLastCalledWith({ page: 2, limit: 48, q: 'iron', serverId: 'hitech' }));
  expect(getPageMock).toHaveBeenCalledTimes(3);
});

test('shows request errors and empty pages', async () => {
  getPageMock.mockRejectedValueOnce(new Error('Сервис недоступен'));
  const { unmount } = render(<FastItemPanel onPick={vi.fn()} onHover={vi.fn()} />);
  expect((await screen.findByRole('alert')).textContent).toContain('Сервис недоступен');

  unmount();
  getPageMock.mockResolvedValueOnce(page([], 0));
  render(<FastItemPanel onPick={vi.fn()} onHover={vi.fn()} />);
  expect(await screen.findByText('Предметы не найдены.')).toBeTruthy();
});

test('keeps an item usable when the shared image was removed during sync', async () => {
  getPageMock.mockResolvedValue(page([{
    raw: '<minecraft:stone>',
    display_name: 'Камень',
    icon: null
  }], 1));

  render(<FastItemPanel onPick={vi.fn()} onHover={vi.fn()} />);

  const itemButton = await screen.findByRole('button', { name: 'Выбрать Камень' });
  expect(itemButton.dataset.itemRaw).toBe('<minecraft:stone>');
  expect(itemButton.querySelector('img')).toBeNull();
});
