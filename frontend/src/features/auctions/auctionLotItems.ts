import type { AuctionLotItem } from './auctionTypes';

export function auctionNameFromItems(items: AuctionLotItem[], fallback: string) {
  return items[0]?.title?.trim() || fallback;
}

export function moveLotItem(items: AuctionLotItem[], uid: string, direction: -1 | 1) {
  const index = items.findIndex((item) => item.uid === uid);
  const nextIndex = index + direction;
  if (index < 0 || nextIndex < 0 || nextIndex >= items.length) return items;
  const nextItems = [...items];
  const [item] = nextItems.splice(index, 1);
  nextItems.splice(nextIndex, 0, item);
  return nextItems;
}
