import React, { useState } from 'react';
import VersionDetailsModal from './VersionDetailsModal';
import VersionQuickSheet from './VersionQuickSheet';

export type VersionStatusState = 'healthy' | 'degraded' | 'unhealthy' | 'checking' | 'unknown';

interface VersionInfoDrawerProps {
  children: (openDrawer: () => void) => React.ReactNode;
  status?: VersionStatusState;
  showStatusIndicator?: boolean;
}

export default function VersionInfoDrawer({
  children,
  status,
  showStatusIndicator = false,
}: VersionInfoDrawerProps) {
  const [showQuickDetails, setShowQuickDetails] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const openQuickDetails = () => setShowQuickDetails(true);
  const closeQuickDetails = () => setShowQuickDetails(false);
  const closeDetails = () => setShowDetails(false);

  const expandToFullDetails = () => {
    setShowQuickDetails(false);
    setShowDetails(true);
  };

  return (
    <>
      {children(openQuickDetails)}
      <VersionQuickSheet
        visible={showQuickDetails}
        onClose={closeQuickDetails}
        onExpand={expandToFullDetails}
        status={status}
        showStatusIndicator={showStatusIndicator}
      />
      <VersionDetailsModal
        visible={showDetails}
        onClose={closeDetails}
        status={status}
        showStatusIndicator={showStatusIndicator}
      />
    </>
  );
}
