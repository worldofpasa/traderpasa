import type { EvidenceItem } from "@pasa-trader/schemas";
import type {
  SourceConnector,
  SourceConnectionStatus,
  SourceCollectionRequest,
  SourceCollectionResult,
  SourceCredentialRef,
} from "../source.js";

const DATA_BASE_URL = "https://data.alpaca.markets/v2";
const BROKER_BASE_URL = "https://paper-api.alpaca.markets";

type FetchFn = typeof fetch;

export interface AlpacaMarketApiKeys {
  keyId: string;
  secretKey: string;
}

function authHeaders(keys: AlpacaMarketApiKeys): Record<string, string> {
  return {
    "APCA-API-KEY-ID": keys.keyId,
    "APCA-API-SECRET-KEY": keys.secretKey,
  };
}

interface AlpacaBar {
  t: string; // timestamp
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

interface AlpacaNewsItem {
  id: number;
  headline: string;
  summary: string;
  url: string;
  created_at: string;
  symbols: string[];
}

export class AlpacaMarketSourceConnector implements SourceConnector {
  readonly id = "alpaca-market";
  readonly reliabilityClass = "official_api" as const;

  constructor(
    private readonly resolveKeys: (credentialId: string) => Promise<AlpacaMarketApiKeys>,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async testConnection(input: SourceCredentialRef | null): Promise<SourceConnectionStatus> {
    const checkedAt = new Date();
    if (!input) {
      return { ok: false, message: "Alpaca market connector requires credentials.", checkedAt };
    }
    try {
      const keys = await this.resolveKeys(input.credentialId);
      const res = await this.fetchFn(`${BROKER_BASE_URL}/v2/account`, {
        headers: authHeaders(keys),
      });
      if (res.ok) return { ok: true, message: "Connected", checkedAt };
      return { ok: false, message: `HTTP ${res.status}`, checkedAt };
    } catch (err) {
      return { ok: false, message: err instanceof Error ? err.message : "Unknown error", checkedAt };
    }
  }

  async collect(input: SourceCollectionRequest): Promise<SourceCollectionResult> {
    const collectedAt = new Date();

    if (!input.credentialRef) {
      return { status: "skipped", items: [], message: "No credentials provided.", collectedAt };
    }

    const keys = await this.resolveKeys(input.credentialRef.credentialId);
    const items: EvidenceItem[] = [];

    try {
      // Collect latest bars for each symbol
      const bars = await this.fetchBars(keys, input.symbols);
      items.push(...bars);

      // Collect news for requested symbols
      const news = await this.fetchNews(keys, input.symbols);
      items.push(...news);

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

  private async fetchBars(
    keys: AlpacaMarketApiKeys,
    symbols: string[],
  ): Promise<EvidenceItem[]> {
    if (symbols.length === 0) return [];

    const symbolList = symbols.join(",");
    const res = await this.fetchFn(
      `${DATA_BASE_URL}/stocks/bars/latest?symbols=${encodeURIComponent(symbolList)}&feed=iex`,
      { headers: authHeaders(keys) },
    );

    if (!res.ok) return [];

    const body = (await res.json()) as { bars: Record<string, AlpacaBar> };
    const now = new Date().toISOString();

    return Object.entries(body.bars ?? {}).map(([symbol, bar]) => ({
      id: `alpaca-bar-${symbol}-${bar.t}`,
      sourceId: this.id,
      sourceName: "Alpaca Market Data",
      reliabilityClass: this.reliabilityClass,
      status: "succeeded" as const,
      observedAt: bar.t ?? now,
      symbols: [symbol],
      title: `${symbol} latest price bar`,
      summary: `${symbol}: open=$${bar.o} high=$${bar.h} low=$${bar.l} close=$${bar.c} volume=${bar.v}`,
      warnings: [],
    }));
  }

  private async fetchNews(
    keys: AlpacaMarketApiKeys,
    symbols: string[],
  ): Promise<EvidenceItem[]> {
    if (symbols.length === 0) return [];

    const symbolList = symbols.join(",");
    const res = await this.fetchFn(
      `${DATA_BASE_URL}/news?symbols=${encodeURIComponent(symbolList)}&limit=10&sort=desc`,
      { headers: authHeaders(keys) },
    );

    if (!res.ok) return [];

    const body = (await res.json()) as { news: AlpacaNewsItem[] };

    return (body.news ?? []).map((item) => ({
      id: `alpaca-news-${item.id}`,
      sourceId: this.id,
      sourceName: "Alpaca Market News",
      reliabilityClass: this.reliabilityClass,
      status: "succeeded" as const,
      observedAt: item.created_at,
      symbols: item.symbols,
      title: item.headline,
      summary: item.summary || item.headline,
      url: item.url,
      warnings: [],
    }));
  }
}
