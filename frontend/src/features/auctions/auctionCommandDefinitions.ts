import type {
  AuctionCommandEntryScope,
  AuctionCommandModeProfile,
  AuctionCommandOrderMode,
  AuctionCommandProfileEntry,
  AuctionCommandTemplateKey,
  AuctionState
} from './auctionTypes';

export const defaultModeTitles = {
  install: 'Новые слоты',
  existing: 'По готовым ID'
};

export const auctionStateFilterLabels: Record<AuctionState, string> = {
  SETUP: 'SETUP',
  ACTIVE: 'ACTIVE',
  PAUSED: 'PAUSED',
  CLOSED: 'CLOSED',
  ENDED: 'ENDED'
};

export const auctionCommandScopeLabels: Record<AuctionCommandEntryScope, string> = {
  file: 'Один раз',
  auction: 'На лот',
  item: 'На предмет'
};

export const auctionCommandOrderModeLabels: Record<AuctionCommandOrderMode, string> = {
  grouped: 'Подряд',
  perLot: 'Циклом за 1 лот'
};

export const auctionCommandTemplateLabels: Record<AuctionCommandTemplateKey, string> = {
  create: 'Создать слот',
  addItem: 'Добавить предмет',
  setName: 'Название',
  setDescription: 'Описание',
  setStartDate: 'Старт',
  setEndDate: 'Конец',
  setCurrency: 'Валюта',
  setStartPrice: 'Стартовая цена',
  setStepPrice: 'Шаг ставки',
  setState: 'Статус',
  scheduleCreate: 'Расписание'
};

export const commandDefinitions: Record<AuctionCommandTemplateKey, {
  scope: AuctionCommandEntryScope;
  template: string;
  requiresServerId?: boolean;
  skipWhenEmptyDescription?: boolean;
}> = {
  create: { scope: 'auction', template: '/aca create {startDate} {endDate} {startPrice} {stepPrice} {currency}' },
  addItem: { scope: 'item', template: '/aca addItem {serverId}', requiresServerId: true },
  setName: { scope: 'auction', template: '/aca setName {serverId} {auctionName}', requiresServerId: true },
  setDescription: { scope: 'auction', template: '/aca setDescription {serverId} {description}', requiresServerId: true, skipWhenEmptyDescription: true },
  setStartDate: { scope: 'auction', template: '/aca setStartDate {serverId} {startDate}', requiresServerId: true },
  setEndDate: { scope: 'auction', template: '/aca setEndDate {serverId} {endDate}', requiresServerId: true },
  setCurrency: { scope: 'auction', template: '/aca setCurrency {serverId} {currency}', requiresServerId: true },
  setStartPrice: { scope: 'auction', template: '/aca setStartPrice {serverId} {startPrice}', requiresServerId: true },
  setStepPrice: { scope: 'auction', template: '/aca setStepPrice {serverId} {stepPrice}', requiresServerId: true },
  setState: { scope: 'auction', template: '/aca setState {serverId} {state}', requiresServerId: true },
  scheduleCreate: { scope: 'auction', template: '/aca scheduleCreate {serverId} {startDate} {scheduleLeadDate} {repeatIntervalSeconds} {durationSeconds}', requiresServerId: true }
};

const installCommandOrder: AuctionCommandTemplateKey[] = ['create', 'addItem', 'setName', 'setDescription', 'setStartDate', 'setEndDate', 'setCurrency', 'setStartPrice', 'setStepPrice', 'setState', 'scheduleCreate'];
const existingCommandOrder: AuctionCommandTemplateKey[] = ['addItem', 'setName', 'setDescription', 'setStartDate', 'setEndDate', 'setCurrency', 'setStartPrice', 'setStepPrice', 'setState', 'scheduleCreate', 'create'];

export function createTemplateEntry(command: AuctionCommandTemplateKey, enabled: boolean): AuctionCommandProfileEntry {
  const definition = commandDefinitions[command];
  return { id: command, kind: 'template', command, label: auctionCommandTemplateLabels[command], template: definition.template, scope: definition.scope, enabled };
}

export function defaultModeProfile(mode: string): AuctionCommandModeProfile {
  const enabledCommands = mode === 'install'
    ? new Set<AuctionCommandTemplateKey>(['create'])
    : new Set<AuctionCommandTemplateKey>(['addItem', 'setName', 'setDescription', 'setStartDate', 'setEndDate', 'setCurrency', 'setStartPrice', 'setStepPrice', 'setState', 'scheduleCreate']);
  const order = mode === 'install' ? installCommandOrder : existingCommandOrder;
  return {
    id: mode,
    title: defaultModeTitles[mode as keyof typeof defaultModeTitles] ?? 'Новый режим',
    orderMode: 'grouped',
    entries: order.map((command) => createTemplateEntry(command, enabledCommands.has(command)))
  };
}
