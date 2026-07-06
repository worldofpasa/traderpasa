import type { EvidenceItem } from "@pasa-trader/schemas";
import type {
  SourceConnector,
  SourceConnectionStatus,
  SourceCollectionRequest,
  SourceCollectionResult,
  SourceCredentialRef,
} from "../source.js";

type FetchFn = typeof fetch;

export interface PoliticianTradesCredentialSecret {
  apiKey?: string;
}

export class PoliticianTradesSourceConnector implements SourceConnector {
  readonly id = "politician-trades";
  readonly reliabilityClass = "best_effort_scrape" as const;

  constructor(
    private readonly resolveKeys?: (credentialId: string) => Promise<PoliticianTradesCredentialSecret>,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async testConnection(input: SourceCredentialRef | null): Promise<SourceConnectionStatus> {
    const checkedAt = new Date();
    try {
      const res = await this.fetchFn(
        "https://raw.githubusercontent.com/timothycarambat/senate-stock-watcher-data/master/aggregate/all_transactions.json",
        { method: "HEAD" },
      );
      if (res.ok) {
        return { ok: true, message: "Politician Stock Watcher registry is reachable", checkedAt };
      }
      return { ok: false, message: `HTTP ${res.status}: ${res.statusText}`, checkedAt };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Unknown error", checkedAt };
    }
  }

  async collect(input: SourceCollectionRequest): Promise<SourceCollectionResult> {
    const collectedAt = new Date();
    const items: EvidenceItem[] = [];

    try {
      const res = await this.fetchFn(
        "https://raw.githubusercontent.com/timothycarambat/senate-stock-watcher-data/master/aggregate/all_transactions.json",
      );
      if (!res.ok) {
        return {
          status: "failed",
          items,
          message: `Failed to fetch politician transactions: HTTP ${res.status}`,
          collectedAt,
        };
      }

      const transactions = (await res.json()) as Array<{
        transaction_date: string;
        ticker: string;
        senator?: string;
        representative?: string;
        type: string;
        amount: string;
        ptr_link?: string;
      }>;

      const upperSymbols = new Set(input.symbols.map((s) => s.toUpperCase()));
      const sortedTrans = [...transactions].reverse().slice(0, 1000);

      for (const tx of sortedTrans) {
        const txTicker = tx.ticker?.toUpperCase();
        if (upperSymbols.has(txTicker)) {
          const name = tx.senator || tx.representative || "Unknown Politician";
          const transactionDateStr = tx.transaction_date;

          // Parse MM/DD/YYYY
          const parts = transactionDateStr.split("/");
          let transactionDate = new Date();
          if (parts.length === 3) {
            const month = parseInt(parts[0]!, 10) - 1;
            const day = parseInt(parts[1]!, 10);
            const year = parseInt(parts[2]!, 10);
            transactionDate = new Date(year, month, day);
          }

          const observedIso = transactionDate.toISOString();
          if (input.since && observedIso < input.since) {
            continue;
          }

          items.push({
            id: `politician-trade-${name}-${transactionDateStr}-${txTicker}-${tx.type}`,
            sourceId: this.id,
            sourceName: "Politician Stock Watcher",
            reliabilityClass: this.reliabilityClass,
            status: "succeeded",
            observedAt: observedIso,
            symbols: [txTicker],
            title: `Politician Trade: ${name}`,
            summary: `${name} reported a trade of ${txTicker} (${tx.type}) for ${tx.amount} on ${transactionDateStr}.`,
            url: tx.ptr_link || undefined,
            warnings: [
              "Politician trade data is best-effort scrape and may be incomplete or delayed.",
            ],
          });
        }
      }

      return { status: items.length > 0 ? "succeeded" : "partial", items, collectedAt };
    } catch (err) {
      return {
        status: "failed",
        items,
        message: err instanceof Error ? err.message : "Collection failed",
        collectedAt,
      };
    }
  }
}
