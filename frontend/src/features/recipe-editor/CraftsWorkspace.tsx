import type { ReactNode } from 'react';

interface CraftsWorkspaceProps {
  favoritesPanel?: ReactNode;
  recipeBuilder: ReactNode;
  recipeFiles: ReactNode;
  neiPanel: ReactNode;
  draftPanels?: ReactNode;
}

/**
 * Desktop crafts workspace. DraftsWorkspace supplies the two draft regions as
 * sibling grid items so their selection state remains shared.
 */
export function CraftsWorkspace({
  favoritesPanel,
  recipeBuilder,
  recipeFiles,
  neiPanel,
  draftPanels
}: CraftsWorkspaceProps) {
  return (
    <div className="workspace-layout workspace-layout-crafts">
      <div className="crafts-region crafts-favorites-region">
        {favoritesPanel}
      </div>
      <div className="crafts-region crafts-center-region">
        {recipeBuilder}
        <div className="desktop-recipe-files">{recipeFiles}</div>
      </div>
      <div className="crafts-region crafts-nei-region">
        {neiPanel}
      </div>
      {draftPanels}
    </div>
  );
}
