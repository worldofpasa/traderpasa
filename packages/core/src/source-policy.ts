export interface SourcePolicyEvidenceItem {
  sourceId: string;
  sourceName: string;
  reliabilityClass: string;
  observedAt: Date;
  staleAt: Date | null;
  warnings: string[];
}

export interface SourcePolicyEntry {
  sourceId: string;
  required: boolean;
  /** Connector result for this run: succeeded | failed | skipped | missing. */
  status: string;
  reliabilityClass: string | null;
  observedAt: string | null;
  staleAt: string | null;
  ttlStatus: "fresh" | "stale" | "unknown";
  warnings: string[];
}

export interface SourcePolicyContext {
  entries: SourcePolicyEntry[];
  /** Human-readable block injected into agent prompts as {{source_policy_block}}. */
  block: string;
  /** Warnings for optional failed/stale sources — feed agent uncertainty. */
  warnings: string[];
  /** True when a required source failed, was skipped, or has only stale evidence. */
  requiredEvidenceMissing: boolean;
}

/**
 * Context-pack assembly for #106: maps the strategy source policy
 * (required/optional connectors) plus the collected evidence bundle into a
 * structured, deterministic context for agent inputs. Agents never fetch data;
 * they only see what connectors collected, annotated with reliability class,
 * observation timestamps, and TTL status.
 */
export function buildSourcePolicyContext(input: {
  sourceConfig: Record<string, { enabled: boolean; required: boolean }> | null;
  sourceResults: Record<string, string> | null;
  evidenceItems: SourcePolicyEvidenceItem[];
  now?: Date;
}): SourcePolicyContext {
  const now = input.now ?? new Date();
  const entries: SourcePolicyEntry[] = [];
  const warnings: string[] = [];
  let requiredEvidenceMissing = false;

  for (const [sourceId, config] of Object.entries(input.sourceConfig ?? {})) {
    if (!config.enabled) continue;

    const status = input.sourceResults?.[sourceId] ?? "missing";
    const items = input.evidenceItems.filter((item) => item.sourceId === sourceId);

    const newest = items.reduce<SourcePolicyEvidenceItem | null>(
      (best, item) => (best === null || item.observedAt > best.observedAt ? item : best),
      null,
    );

    let ttlStatus: SourcePolicyEntry["ttlStatus"] = "unknown";
    if (newest?.staleAt) {
      ttlStatus = now > newest.staleAt ? "stale" : "fresh";
    }

    const entry: SourcePolicyEntry = {
      sourceId,
      required: config.required,
      status,
      reliabilityClass: newest?.reliabilityClass ?? null,
      observedAt: newest?.observedAt.toISOString() ?? null,
      staleAt: newest?.staleAt?.toISOString() ?? null,
      ttlStatus,
      warnings: items.flatMap((item) => item.warnings),
    };
    entries.push(entry);

    const collected = status === "succeeded" && items.length > 0;
    const usable = collected && ttlStatus !== "stale";

    if (config.required && !usable) {
      requiredEvidenceMissing = true;
    }
    if (!usable) {
      const reason = !collected ? `status=${status}` : "evidence is past its staleness threshold";
      warnings.push(
        `${config.required ? "Required" : "Optional"} source "${sourceId}" is not usable (${reason}).`,
      );
    }
  }

  const lines = entries.map((entry) => {
    const parts = [
      `- ${entry.sourceId} [${entry.required ? "REQUIRED" : "optional"}]`,
      `status=${entry.status}`,
      `reliability=${entry.reliabilityClass ?? "unknown"}`,
      `observedAt=${entry.observedAt ?? "never"}`,
      `ttl=${entry.ttlStatus}`,
    ];
    if (entry.warnings.length > 0) parts.push(`warnings=${entry.warnings.join("; ")}`);
    return parts.join(" | ");
  });

  const block =
    entries.length === 0
      ? "No source connectors are configured for this strategy."
      : [
          "Source policy and evidence status for this run:",
          ...lines,
          ...(warnings.length > 0 ? ["", "Caveats:", ...warnings.map((w) => `- ${w}`)] : []),
          "",
          "Treat lower-reliability sources (best_effort_scrape) with more skepticism than official APIs.",
          "Reflect missing or stale sources explicitly in your uncertainty assessment.",
        ].join("\n");

  return { entries, block, warnings, requiredEvidenceMissing };
}
