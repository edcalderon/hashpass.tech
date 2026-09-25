import React from 'react';
import PassesDisplay from './PassesDisplay';

/** Event passes come from the authenticated pass service, not sample NFTs. */
export default function BlockchainTicketsView({
  businessInviteCode,
}: {
  businessInviteCode?: string;
}) {
  return (
    <PassesDisplay
      mode="dashboard"
      showTitle={false}
      walletLayout="stacked"
      businessInviteCode={businessInviteCode}
    />
  );
}
