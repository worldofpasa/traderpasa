"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { RunDetailView } from "../../components/run-detail-view";

interface RunDetailClientProps {
  runId: string;
}

export function RunDetailClient({ runId }: RunDetailClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const strategyIdFromQuery = searchParams.get("strategyId");
  const backHref = strategyIdFromQuery
    ? `/strategies/${strategyIdFromQuery}?tab=runs&run=${runId}`
    : "/strategies";

  useEffect(() => {
    if (strategyIdFromQuery) {
      router.replace(`/strategies/${strategyIdFromQuery}?tab=runs&run=${runId}`);
    }
  }, [strategyIdFromQuery, runId, router]);

  if (strategyIdFromQuery) {
    return (
      <div className="rd-page">
        <div className="rd-inner">
          <div style={{ color: "var(--muted)", fontSize: "0.82rem", paddingTop: "2rem" }}>
            Opening run in strategy view…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rd-page">
      <div className="rd-inner">
        <Link href={backHref} className="rd-back" data-testid="run-detail-back">
          <ArrowLeft size={14} /> Back to strategy runs
        </Link>
        <RunDetailView runId={runId} />
      </div>
    </div>
  );
}
