import { type ReactNode, useState } from 'react';

interface MobileRecipeWorkspaceProps {
  canUseNeiFavorites: boolean;
  recipeBuilder: ReactNode;
  recipeFiles: ReactNode;
  neiPanel: ReactNode;
  neiFavoritesPanel?: ReactNode;
}

export function MobileRecipeWorkspace({
  canUseNeiFavorites,
  recipeBuilder,
  recipeFiles,
  neiPanel,
  neiFavoritesPanel
}: MobileRecipeWorkspaceProps) {
  const [mobileNeiTab, setMobileNeiTab] = useState<'items' | 'favorites'>('items');
  const showFavorites = canUseNeiFavorites && Boolean(neiFavoritesPanel);

  return (
    <div className={`workspace-layout workspace-layout-editor workspace-layout-builder workspace-layout-main ${showFavorites ? 'has-nei-favorites' : ''}`.trim()}>
      <div className="workspace-column workspace-center">
        {recipeBuilder}
        <div className="desktop-recipe-files">{recipeFiles}</div>
      </div>

      <div className={`mobile-nei-tabs ${mobileNeiTab === 'items' ? 'show-items' : 'show-favorites'}`.trim()}>
        {showFavorites ? (
          <div className="mobile-nei-tab-list" role="tablist" aria-label="mobile-nei-tabs">
            <button
              type="button"
              role="tab"
              aria-selected={mobileNeiTab === 'items'}
              className={mobileNeiTab === 'items' ? 'active' : ''}
              onClick={() => setMobileNeiTab('items')}
            >
              NEI
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mobileNeiTab === 'favorites'}
              className={mobileNeiTab === 'favorites' ? 'active' : ''}
              onClick={() => setMobileNeiTab('favorites')}
            >
              Избранное
            </button>
          </div>
        ) : null}
        <div className="workspace-column workspace-right mobile-nei-panel mobile-nei-items-panel">
          {neiPanel}
        </div>
        {showFavorites ? (
          <div className="workspace-column workspace-favorites mobile-nei-panel mobile-nei-favorites-panel">
            {neiFavoritesPanel}
          </div>
        ) : null}
      </div>
    </div>
  );
}
