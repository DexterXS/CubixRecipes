import type { ReactNode } from 'react';

type DiagnosticsAccessPanelProps = {
  usersContent: ReactNode;
  whitelistContent: ReactNode;
};

export function DiagnosticsAccessPanel({
  usersContent,
  whitelistContent
}: DiagnosticsAccessPanelProps) {
  return (
    <div className="debug-section-grid">
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Персонал</h3>
          <span>Роли пользователей и доступ по Google почте.</span>
        </div>
        {usersContent}
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Whitelist</h3>
          <span>Допуск операторов и админов на сайт.</span>
        </div>
        {whitelistContent}
      </section>
      <section className="settings-section">
        <div className="settings-section-title">
          <h3>Доступ по ролям</h3>
          <span>Справочник текущих ролей сайта.</span>
        </div>
        <div className="permissions-grid">
          <div><strong>admin</strong><span>файлы, рецепты, настройки, роли, отладка</span></div>
          <div><strong>moderator</strong><span>создание шаблонов и черновиков</span></div>
          <div><strong>default</strong><span>только просмотр</span></div>
        </div>
      </section>
    </div>
  );
}
