import type { EvidenceItem } from "@pasa-trader/schemas";
import type {
  SourceConnector,
  SourceConnectionStatus,
  SourceCollectionRequest,
  SourceCollectionResult,
  SourceCredentialRef,
} from "../source.js";

type FetchFn = typeof fetch;

export interface Sec13fCredentialSecret {
  userAgent: string;
}

export const NOTABLE_MANAGERS = [
  { name: "Berkshire Hathaway Inc", cik: "0001067983" },
  { name: "Renaissance Technologies LLC", cik: "0001037389" },
  { name: "Tiger Global Management LLC", cik: "0001579241" },
];

export class Sec13fSourceConnector implements SourceConnector {
  readonly id = "sec-13f";
  readonly reliabilityClass = "official_api" as const;

  constructor(
    private readonly resolveKeys?: (credentialId: string) => Promise<Sec13fCredentialSecret>,
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
      const res = await this.fetchFn(`https://data.sec.gov/submissions/CIK${NOTABLE_MANAGERS[0]!.cik}.json`, {
        headers: { "User-Agent": userAgent },
      });
      if (res.ok) {
        return { ok: true, message: "Connected to SEC 13F API", checkedAt };
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
      for (const manager of NOTABLE_MANAGERS) {
        const filings = await this.fetchRecent13FFilings(manager.cik, manager.name, input.symbols, userAgent);
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

  private async fetchRecent13FFilings(
    cik: string,
    managerName: string,
    symbols: string[],
    userAgent: string,
  ): Promise<EvidenceItem[]> {
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
      if (form !== "13F-HR" && form !== "13F-NT") {
        continue;
      }

      const accNum = recent.accessionNumber[i]!;
      const filingDate = recent.filingDate[i]!;
      const reportDate = recent.reportDate[i]!;
      const primaryDoc = recent.primaryDocument[i]!;
      const primaryDocDesc = recent.primaryDocDescription[i] || "";

      const fDate = new Date(filingDate);
      const rDate = new Date(reportDate);
      const delayDays = Math.round((fDate.getTime() - rDate.getTime()) / (1000 * 60 * 60 * 24));

      const accNumClean = accNum.replace(/-/g, "");
      const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNumClean}/${primaryDoc}`;

      items.push({
        id: `sec-13f-${cik}-${accNum}`,
        sourceId: this.id,
        sourceName: "SEC 13F",
        reliabilityClass: this.reliabilityClass,
        status: "succeeded",
        observedAt: fDate.toISOString(),
        symbols,
        title: `${managerName} Form ${form} Filing`,
        summary: `${managerName} filed Form ${form} on ${filingDate} for the quarter ending ${reportDate}. Reporting delay: ${delayDays} days. ${primaryDocDesc}`,
        url,
        warnings: delayDays > 45 ? [`Filing delay exceeds 45 days (${delayDays} days)`] : [],
      });
    }

    return items;
  }
}
