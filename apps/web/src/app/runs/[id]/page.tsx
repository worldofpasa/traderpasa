import { Suspense } from "react";
import { RunDetailClient } from "./run-detail-client";

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <Suspense
      fallback={
        <div className="rd-page">
          <div className="rd-inner">
            <div style={{ color: "var(--muted)", fontSize: "0.82rem", paddingTop: "2rem" }}>
              Loading run…
            </div>
          </div>
        </div>
      }
    >
      <RunDetailClient runId={id} />
    </Suspense>
  );
}
