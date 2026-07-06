import type { EvidenceItem } from "@pasa-trader/schemas";
import type {
  SourceConnector,
  SourceConnectionStatus,
  SourceCollectionRequest,
  SourceCollectionResult,
  SourceCredentialRef,
} from "../source.js";

type FetchFn = typeof fetch;

export interface SecForm4CredentialSecret {
  userAgent: string;
}

export class SecForm4SourceConnector implements SourceConnector {
  readonly id = "sec-form4";
  readonly reliabilityClass = "official_api" as const;

  constructor(
    private readonly resolveKeys?: (credentialId: string) => Promise<SecForm4CredentialSecret>,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  private async getUserAgent(input: SourceCredentialRef | null): Promise<string> {
    if (input && this.resolveKeys) {
      try {
        const creds = await this.resolveKeys(input.credentialId);
        if (creds.userAgent) return creds.userAgent;
      } catch {
        // ignore and fallback
      }
    }
    return "PasaTraderPlatform/1.0 (admin@pasatrader.local)";
  }

  async testConnection(input: SourceCredentialRef | null): Promise<SourceConnectionStatus> {
    const checkedAt = new Date();
    const userAgent = await this.getUserAgent(input);
    try {
      const res = await this.fetchFn("https://www.sec.gov/files/company_tickers.json", {
        headers: { "User-Agent": userAgent },
      });
      if (res.ok) {
        return { ok: true, message: "Connected to SEC Form 4 API", checkedAt };
      }
      return { ok: false, message: `HTTP ${res.status}: ${res.statusText}`, checkedAt };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Unknown error", checkedAt };
    }
  }

  async collect(input: SourceCollectionRequest): Promise<SourceCollectionResult> {
    const collectedAt = new Date();
    const userAgent = await this.getUserAgent(input.credentialRef);
    const items: EvidenceItem[] = [];

    try {
      for (const symbol of input.symbols) {
        const cik = await this.getCikForTicker(symbol, userAgent);
        if (!cik) {
          continue;
        }

        const filings = await this.fetchRecentForm4Filings(cik, symbol, userAgent);
        for (const f of filings) {
          if (input.since && f.observedAt < input.since) {
            continue;
          }
          items.push(f);
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

  private async getCikForTicker(ticker: string, userAgent: string): Promise<string | null> {
    const res = await this.fetchFn("https://www.sec.gov/files/company_tickers.json", {
      headers: { "User-Agent": userAgent },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, { cik_str: number; ticker: string; title: string }>;
    const match = Object.values(data).find((item) => item.ticker.toUpperCase() === ticker.toUpperCase());
    if (!match) return null;
    return match.cik_str.toString().padStart(10, "0");
  }

  private async fetchRecentForm4Filings(cik: string, symbol: string, userAgent: string): Promise<EvidenceItem[]> {
    const res = await this.fetchFn(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: { "User-Agent": userAgent },
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      name: string;
      filings?: {
        recent?: {
          accessionNumber: string[];
          filingDate: string[];
          reportDate: string[];
          form: string[];
          primaryDocument: string[];
          primaryDocDescription: string[];
        };
      };
    };

    const recent = data.filings?.recent;
    if (!recent || !recent.accessionNumber) return [];

    const items: EvidenceItem[] = [];
    const len = recent.accessionNumber.length;

    for (let i = 0; i < len; i++) {
      const form = recent.form[i];
      if (form !== "4") {
        continue;
      }

      const accNum = recent.accessionNumber[i]!;
      const filingDate = recent.filingDate[i]!;
      const reportDate = recent.reportDate[i]!;
      const primaryDoc = recent.primaryDocument[i]!;
      const primaryDocDesc = recent.primaryDocDescription[i] || "";

      const accNumClean = accNum.replace(/-/g, "");
      const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNumClean}/${primaryDoc}`;

      items.push({
        id: `sec-form4-${accNum}`,
        sourceId: this.id,
        sourceName: "SEC Form 4",
        reliabilityClass: this.reliabilityClass,
        status: "succeeded",
        observedAt: new Date(filingDate).toISOString(),
        symbols: [symbol],
        title: `${symbol} Insider Trade (Form 4)`,
        summary: `${data.name} insider transaction reported on ${filingDate} (Transaction Date: ${reportDate}). ${primaryDocDesc}`,
        url,
        warnings: [],
      });
    }

    return items;
  }
}
