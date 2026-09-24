import type { ReactNode } from 'react';

interface CraftsWorkspaceProps {
  favoritesPanel?: ReactNode;
  recipeBuilder: ReactNode;
  recipeFiles: ReactNode;
  neiPanel: ReactNode;
  draftItemsPanel?: ReactNode;
  draftTemplatesPanel?: ReactNode;
}

/**
 * Desktop crafts workspace. The two draft regions are placed into their
 * respective side columns while DraftsWorkspace keeps their state shared.
 */
export function CraftsWorkspace({
  favoritesPanel,
  recipeBuilder,
  recipeFiles,
  neiPanel,
  draftItemsPanel,
  draftTemplatesPanel
}: CraftsWorkspaceProps) {
  return (
    <div className="workspace-layout workspace-layout-crafts">
      <div className="crafts-side-column crafts-left-column">
        <div className="crafts-region crafts-favorites-region">{favoritesPanel}</div>
        {draftItemsPanel ? <div className="crafts-region crafts-drafts-region">{draftItemsPanel}</div> : null}
      </div>
      <div className="crafts-region crafts-center-region">
        {recipeBuilder}
        <div className="desktop-recipe-files">{recipeFiles}</div>
      </div>
      <div className="crafts-side-column crafts-right-column">
        <div className="crafts-region crafts-nei-region">{neiPanel}</div>
        {draftTemplatesPanel ? <div className="crafts-region crafts-templates-region">{draftTemplatesPanel}</div> : null}
      </div>
    </div>
  );
}
