import type { EvidenceItem, SourceReliabilityClass } from "@pasa-trader/schemas";

export interface SourceCredentialRef {
  credentialId: string;
}

export interface SourceConnectionStatus {
  ok: boolean;
  message: string;
  checkedAt: Date;
}

export interface SourceCollectionRequest {
  symbols: string[];
  credentialRef: SourceCredentialRef | null;
  /** ISO 8601 datetime — only collect items newer than this */
  since?: string;
}

export type SourceResultStatus = "succeeded" | "failed" | "stale" | "skipped" | "partial";

export interface SourceCollectionResult {
  status: SourceResultStatus;
  items: EvidenceItem[];
  /** Human-readable explanation when status is not succeeded */
  message?: string;
  collectedAt: Date;
}

export interface SourceConnector {
  readonly id: string;
  readonly reliabilityClass: SourceReliabilityClass;
  testConnection(input: SourceCredentialRef | null): Promise<SourceConnectionStatus>;
  collect(input: SourceCollectionRequest): Promise<SourceCollectionResult>;
}
