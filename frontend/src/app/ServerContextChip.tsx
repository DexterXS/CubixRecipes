type ServerContextChipProps = {
  serverName: string | null;
  onResetServer?: () => void;
};

export function ServerContextChip({ serverName, onResetServer }: ServerContextChipProps) {
  if (!serverName) {
    return null;
  }

  return (
    <div className="active-server-chip" title="Активный сервер">
      <span className="server-icon">SRV</span>
      <span className="server-name-label">{serverName}</span>
      {onResetServer ? (
        <button
          type="button"
          className="change-server-inline-btn"
          onClick={onResetServer}
          title="Сменить сервер"
        >
          Сменить
        </button>
      ) : null}
    </div>
  );
}
