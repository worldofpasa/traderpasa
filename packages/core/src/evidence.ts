import { getPrismaClient, type PrismaClient, type EvidenceBundle, type SourceReliabilityClass, type EvidenceItemStatus } from "@pasa-trader/db";
import {
  AlpacaMarketSourceConnector,
  SecEdgarSourceConnector,
  SecForm4SourceConnector,
  Sec13fSourceConnector,
  PoliticianTradesSourceConnector,
  type SourceConnector,
  type SourceCredentialRef,
} from "@pasa-trader/adapters";
import { decryptCredentialSecret, getCredentialEncryptionKeyFromEnv } from "./credentials.js";
import { alpacaCredentialSecretSchema, type EvidenceItem as SourceEvidenceItem } from "@pasa-trader/schemas";
import { createAgentStep, updateAgentStep } from "./agent-steps.js";

const CONNECTOR_DISPLAY_NAMES: Record<string, string> = {
  "alpaca-market": "Alpaca Market Data",
  "sec-edgar": "SEC EDGAR Filings",
  "sec-form4": "SEC Form 4 Insider Trades",
  "sec-13f": "SEC 13F Holdings",
  "politician-trades": "Politician Trade Disclosures",
};

export async function collectEvidenceForStrategy(
  strategyInstanceId: string,
  db: PrismaClient = getPrismaClient(),
  jobRunId?: string,
): Promise<EvidenceBundle> {
  const strategy = await db.strategyInstance.findUnique({
    where: { id: strategyInstanceId },
    include: { brokerAccount: true },
  });

  if (!strategy || strategy.status === "DELETED") {
    throw new Error("Strategy instance not found or deleted.");
  }

  const symbols = strategy.symbols;
  const sourceConfig = strategy.sourceConfig as Record<string, { enabled: boolean; required: boolean }>;
  const userId = strategy.userId;

  const connectorsToRun: Array<{
    id: string;
    required: boolean;
    connector: SourceConnector;
    credentialRef: SourceCredentialRef | null;
  }> = [];

  for (const [sourceId, config] of Object.entries(sourceConfig || {})) {
    if (!config.enabled) continue;

    let connector: SourceConnector;
    let credentialRef: SourceCredentialRef | null = null;

    if (sourceId === "alpaca-market") {
      if (!strategy.brokerAccount) {
        throw new Error("Alpaca market source enabled but no broker account linked to strategy.");
      }
      credentialRef = { credentialId: strategy.brokerAccount.credentialId };
      connector = new AlpacaMarketSourceConnector((credId) =>
        resolveAlpacaKeys(credId, userId, db),
      );
      connectorsToRun.push({ id: sourceId, required: config.required, connector, credentialRef });
    } else if (sourceId === "sec-edgar") {
      connector = new SecEdgarSourceConnector();
      connectorsToRun.push({ id: sourceId, required: config.required, connector, credentialRef: null });
    } else if (sourceId === "sec-form4") {
      connector = new SecForm4SourceConnector();
      connectorsToRun.push({ id: sourceId, required: config.required, connector, credentialRef: null });
    } else if (sourceId === "sec-13f") {
      connector = new Sec13fSourceConnector();
      connectorsToRun.push({ id: sourceId, required: config.required, connector, credentialRef: null });
    } else if (sourceId === "politician-trades") {
      connector = new PoliticianTradesSourceConnector();
      connectorsToRun.push({ id: sourceId, required: config.required, connector, credentialRef: null });
    }
  }

  const sourceResults: Record<string, string> = {};
  const allItems: SourceEvidenceItem[] = [];
  let bundleStatus: "COMPLETE" | "PARTIAL" | "FAILED" = "COMPLETE";

  for (let idx = 0; idx < connectorsToRun.length; idx++) {
    const item = connectorsToRun[idx]!;
    const displayName = CONNECTOR_DISPLAY_NAMES[item.id] ?? item.id;
    const stepStart = Date.now();
    const stepId = jobRunId
      ? await createAgentStep(db, {
          jobRunId,
          phase: "EVIDENCE",
          stepIndex: idx,
          name: displayName,
          role: "Source Connector",
          metadata: { sourceId: item.id, required: item.required },
        })
      : null;

    try {
      const result = await item.connector.collect({
        symbols,
        credentialRef: item.credentialRef,
      });

      sourceResults[item.id] = result.status;

      const isFailed = result.status === "failed";
      const isPartial = result.status === "partial";

      if (isFailed) {
        if (item.required) bundleStatus = "FAILED";
        else if (bundleStatus !== "FAILED") bundleStatus = "PARTIAL";
      } else if (isPartial && bundleStatus === "COMPLETE") {
        bundleStatus = "PARTIAL";
      }

      if (result.items) allItems.push(...result.items);

      await updateAgentStep(db, stepId, {
        status: isFailed ? "FAILED" : isPartial ? "PARTIAL" : "COMPLETED",
        durationMs: Date.now() - stepStart,
        outputData: { status: result.status, itemCount: result.items?.length ?? 0 },
      });
    } catch (err) {
      sourceResults[item.id] = "failed";
      if (item.required) bundleStatus = "FAILED";
      else if (bundleStatus !== "FAILED") bundleStatus = "PARTIAL";
      await updateAgentStep(db, stepId, {
        status: "FAILED",
        durationMs: Date.now() - stepStart,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return await db.$transaction(async (tx) => {
    const bundle = await tx.evidenceBundle.create({
      data: {
        strategyInstanceId,
        jobRunId: jobRunId || null,
        status: bundleStatus,
        sourceResults,
        runAt: new Date(),
      },
    });

    if (allItems.length > 0) {
      await tx.evidenceItem.createMany({
        data: allItems.map((item) => ({
          bundleId: bundle.id,
          sourceId: item.sourceId,
          sourceName: item.sourceName,
          reliabilityClass: item.reliabilityClass.toUpperCase().replace(/_/g, "_") as SourceReliabilityClass,
          status: item.status.toUpperCase() as EvidenceItemStatus,
          observedAt: new Date(item.observedAt),
          staleAt: item.staleAt ? new Date(item.staleAt) : null,
          symbols: item.symbols,
          title: item.title,
          summary: item.summary,
          url: item.url || null,
          warnings: item.warnings,
          payloadRef: item.payloadRef || null,
        })),
      });
    }

    return bundle;
  });
}

async function resolveAlpacaKeys(credentialId: string, userId: string, db: PrismaClient) {
  const credential = await db.credential.findFirst({
    where: { id: credentialId, userId, kind: "BROKER" },
    select: { iv: true, encryptedPayload: true, authTag: true },
  });
  if (!credential) throw new Error("Alpaca credential not found.");
  const secret = decryptCredentialSecret(
    { iv: credential.iv, encryptedPayload: credential.encryptedPayload, authTag: credential.authTag },
    getCredentialEncryptionKeyFromEnv(),
  );
  const parsed = alpacaCredentialSecretSchema.parse(JSON.parse(secret));
  return {
    keyId: parsed.keyId,
    secretKey: parsed.secretKey,
  };
}
