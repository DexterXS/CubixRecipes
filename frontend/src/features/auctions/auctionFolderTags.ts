import type { AuctionFolderTag } from './auctionTypes';

export const auctionFolderTags: AuctionFolderTag[] = ['red', 'orange', 'green', 'cyan', 'blue', 'purple', 'pink'];

export const auctionFolderTagLabels: Record<AuctionFolderTag, string> = {
  red: 'Красный',
  orange: 'Оранжевый',
  green: 'Зелёный',
  cyan: 'Бирюзовый',
  blue: 'Синий',
  purple: 'Фиолетовый',
  pink: 'Розовый'
};

export const auctionFolderTagColors: Record<AuctionFolderTag, string> = {
  red: '#ff6b6b',
  orange: '#ffb454',
  green: '#55d483',
  cyan: '#54d8ff',
  blue: '#5d9cff',
  purple: '#a879ff',
  pink: '#ff78c7'
};
