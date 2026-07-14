const variableRows = [
  ['{player}', 'Ник или цель команды', '@p'],
  ['{mode}', 'ID выбранного режима', 'existing'],
  ['{modeTitle}', 'Название выбранного режима', 'Изменение готовых лотов'],
  ['{statusFilters}', 'Выбранные статусы через запятую', 'ACTIVE,PAUSED'],
  ['{auctionId}', 'Локальный ID лота в планировщике', 'auction-42'],
  ['{auctionName}', 'Название лота', 'Квантовый генератор'],
  ['{description}', 'Описание лота', 'вырабатывает 5 000 000 EU в тик'],
  ['{runLabel}', 'Название запуска повтора', 'Квантовый генератор #1'],
  ['{runIndex}', 'Номер запуска повтора', '1'],
  ['{serverId}', 'ID аукциона на сервере', '340'],
  ['{state}', 'Статус лота', 'ACTIVE'],
  ['{currency}', 'Валюта лота', 'VAULT'],
  ['{startDate}', 'Дата и время старта для команды', '14.07.2026_09:00'],
  ['{endDate}', 'Дата и время конца для команды', '17.07.2026_18:00'],
  ['{startPrice}', 'Стартовая цена', '5000'],
  ['{stepPrice}', 'Шаг ставки', '20'],
  ['{scheduleLeadDate}', 'Время создания планируемого слота', '14.07.2026_08:55'],
  ['{repeatIntervalSeconds}', 'Интервал повтора в секундах', '604800'],
  ['{durationSeconds}', 'Длительность в секундах', '291600'],
  ['{itemId}', 'ID предмета для команд на предмет', 'advancedsolarpanel:blockadvsolarpanel'],
  ['{meta}', 'Meta предмета', '0'],
  ['{quantity}', 'Количество предметов', '1'],
  ['{itemTitle}', 'Название предмета', 'Квантовый генератор'],
  ['{itemRaw}', 'Raw-строка предмета из NEI', '<advancedsolarpanel:blockadvsolarpanel:0>']
];

export function AuctionCommandVariablesHelp({ onClose }: { onClose: () => void }) {
  return (
    <section className="auction-command-help-panel">
      <div className="auction-command-help-head">
        <strong>Переменные команд</strong>
        <button type="button" onClick={onClose}>Скрыть</button>
      </div>
      <div className="auction-command-help-table">
        {variableRows.map(([variable, description, example]) => (
          <div key={variable} className="auction-command-help-row">
            <code>{variable}</code>
            <span>{description}</span>
            <em>{example}</em>
          </div>
        ))}
      </div>
    </section>
  );
}
