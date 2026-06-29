import { useEffect, useState } from 'react';
import { listServers, createServer, renameServer, deleteServer, ServerInfo } from '../services/api';
import { AuthUser } from '../types';

interface ServerSelectProps {
  authUser: AuthUser;
  onSelect: (serverId: string) => void;
}

export function ServerSelect({ authUser, onSelect }: ServerSelectProps) {
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const [targetServer, setTargetServer] = useState<ServerInfo | null>(null);
  const [inputName, setInputName] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const fetchServers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listServers();
      setServers(res.servers);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchServers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = inputName.trim();
    if (!name) return;
    setActionLoading(true);
    setModalError(null);
    try {
      const res = await createServer(name);
      setServers(res.servers);
      setIsCreateOpen(false);
      setInputName('');
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = inputName.trim();
    if (!name || !targetServer) return;
    setActionLoading(true);
    setModalError(null);
    try {
      const res = await renameServer(targetServer.id, name);
      setServers(res.servers);
      setIsRenameOpen(false);
      setTargetServer(null);
      setInputName('');
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!targetServer) return;
    setActionLoading(true);
    setModalError(null);
    try {
      const res = await deleteServer(targetServer.id);
      setServers(res.servers);
      setIsDeleteOpen(false);
      setTargetServer(null);
    } catch (err) {
      setModalError(err instanceof Error ? err.message : String(err));
    } finally {
      setActionLoading(false);
    }
  };

  const getGradient = (index: number) => {
    const gradients = [
      'linear-gradient(135deg, #1e3c72 0%, #2a5298 100%)', // Deep Blue
      'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)', // Turquoise-Green
      'linear-gradient(135deg, #8a2387 0%, #e94057 100%, #f27121 100%)', // Purple-Pink-Orange
      'linear-gradient(135deg, #da22ff 0%, #9733ee 100%)', // Violet
      'linear-gradient(135deg, #f12711 0%, #f5af19 100%)', // Fire
    ];
    return gradients[index % gradients.length];
  };

  if (loading) {
    return (
      <main className="server-select-shell">
        <div className="server-loading">
          <div className="loading-spinner"></div>
          <span>Загрузка серверов...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="server-select-shell">
      <section className="server-select-container">
        <header className="server-select-header">
          <h1>CubixRecipes</h1>
          <p>Выберите сервер для управления рецептами</p>
        </header>

        {error && (
          <div className="server-select-error">
            <span>Ошибка: {error}</span>
            <button onClick={() => void fetchServers()}>Повторить попытку</button>
          </div>
        )}

        <div className="servers-grid">
          {servers.map((server, idx) => (
            <div
              key={server.id}
              className="server-card"
              style={{ background: getGradient(idx) }}
              onClick={() => onSelect(server.id)}
            >
              <div className="server-card-glow"></div>
              <div className="server-card-content">
                <h2>{server.name}</h2>
                <div className="server-card-footer">
                  <span>Перейти в панель &rarr;</span>
                </div>
              </div>

              {authUser.is_root_admin && (
                <div className="server-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    title="Переименовать сервер"
                    className="action-btn rename-btn"
                    onClick={() => {
                      setTargetServer(server);
                      setInputName(server.name);
                      setModalError(null);
                      setIsRenameOpen(true);
                    }}
                  >
                    ✏️
                  </button>
                  {server.id !== 'hitech' && (
                    <button
                      type="button"
                      title="Удалить сервер"
                      className="action-btn delete-btn"
                      onClick={() => {
                        setTargetServer(server);
                        setModalError(null);
                        setIsDeleteOpen(true);
                      }}
                    >
                      🗑️
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}

          {authUser.is_root_admin && (
            <div className="server-card add-server-card" onClick={() => {
              setInputName('');
              setModalError(null);
              setIsCreateOpen(true);
            }}>
              <div className="add-server-content">
                <span className="plus-icon">+</span>
                <span>Добавить сервер</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Create Server Modal */}
      {isCreateOpen && (
        <div className="server-modal-overlay" onClick={() => setIsCreateOpen(false)}>
          <div className="server-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Создать новый сервер</h3>
            <p className="modal-description">Создает чистую копию без модов и атласов. Вы сможете загрузить их в настройках.</p>
            <form onSubmit={(e) => { void handleCreate(e); }}>
              <input
                type="text"
                autoFocus
                placeholder="Название сервера (например, SkyTech)"
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                disabled={actionLoading}
              />
              {modalError && <div className="modal-error">{modalError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setIsCreateOpen(false)} disabled={actionLoading}>
                  Отмена
                </button>
                <button type="submit" className="btn-submit" disabled={actionLoading || !inputName.trim()}>
                  {actionLoading ? 'Создание...' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Server Modal */}
      {isRenameOpen && (
        <div className="server-modal-overlay" onClick={() => setIsRenameOpen(false)}>
          <div className="server-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Переименовать сервер</h3>
            <form onSubmit={(e) => { void handleRename(e); }}>
              <input
                type="text"
                autoFocus
                value={inputName}
                onChange={(e) => setInputName(e.target.value)}
                disabled={actionLoading}
              />
              {modalError && <div className="modal-error">{modalError}</div>}
              <div className="modal-actions">
                <button type="button" className="btn-cancel" onClick={() => setIsRenameOpen(false)} disabled={actionLoading}>
                  Отмена
                </button>
                <button type="submit" className="btn-submit" disabled={actionLoading || !inputName.trim()}>
                  {actionLoading ? 'Сохранение...' : 'Сохранить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Server Modal */}
      {isDeleteOpen && (
        <div className="server-modal-overlay" onClick={() => setIsDeleteOpen(false)}>
          <div className="server-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Удалить сервер</h3>
            <p className="modal-description warning-text">
              Вы уверены, что хотите удалить сервер <strong>{targetServer?.name}</strong>?
              Это действие необратимо удалит все связанные скрипты, черновики, задачи и каталоги!
            </p>
            {modalError && <div className="modal-error">{modalError}</div>}
            <div className="modal-actions">
              <button className="btn-cancel" onClick={() => setIsDeleteOpen(false)} disabled={actionLoading}>
                Отмена
              </button>
              <button className="btn-danger" onClick={() => { void handleDelete(); }} disabled={actionLoading}>
                {actionLoading ? 'Удаление...' : 'Да, удалить сервер'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
