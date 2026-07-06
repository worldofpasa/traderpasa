import { Suspense } from "react";
import { StrategyDetailClient } from "./strategy-detail-client";

export default async function StrategyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <Suspense fallback={<div className="dashboard-loading-container"><div className="dashboard-loading-content"><div className="eyebrow animated-pulse">Loading strategy…</div></div></div>}>
      <StrategyDetailClient strategyId={id} />
    </Suspense>
  );
}
