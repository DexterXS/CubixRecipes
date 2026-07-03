import type { ReactNode } from 'react';

type AuctionHelpTipProps = {
  label: string;
  children: ReactNode;
};

export function AuctionHelpTip({ label, children }: AuctionHelpTipProps) {
  return (
    <span className="auction-help-tip">
      <span className="auction-help-trigger" tabIndex={0} aria-label={label}>?</span>
      <span className="auction-help-popover" role="tooltip">{children}</span>
    </span>
  );
}
