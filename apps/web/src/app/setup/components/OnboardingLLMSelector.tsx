"use client";

import { useState, useCallback, type SyntheticEvent } from "react";
import { getCsrfHeader } from "../../csrf-client";

// ─── Static provider registry ────────────────────────────────────────────────
// Mirrors packages/core/src/llm/providerRegistry.ts — kept client-side to
// avoid a server round-trip for static data.

interface ProviderInfo {
  id: string;
  displayName: string;
  docsUrl: string;
  apiKeyLabel: string;
  apiKeyPlaceholder: string;
  requiresBaseUrl: boolean;
  baseUrlLabel?: string;
  baseUrlPlaceholder?: string;
  baseUrlDefault?: string;
  notes?: string;
}

const PROVIDERS: ProviderInfo[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    docsUrl: "https://platform.openai.com/api-keys",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "sk-...",
    requiresBaseUrl: false,
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    docsUrl: "https://console.anthropic.com/settings/keys",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "sk-ant-...",
    requiresBaseUrl: false,
  },
  {
    id: "gemini",
    displayName: "Google Gemini",
    docsUrl: "https://aistudio.google.com/app/apikey",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "AIza...",
    requiresBaseUrl: false,
  },
  {
    id: "openrouter",
    displayName: "OpenRouter",
    docsUrl: "https://openrouter.ai/settings/keys",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "sk-or-...",
    requiresBaseUrl: false,
  },
  {
    id: "groq",
    displayName: "Groq",
    docsUrl: "https://console.groq.com/keys",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "gsk_...",
    requiresBaseUrl: false,
  },
  {
    id: "cloudflare",
    displayName: "Cloudflare AI Gateway",
    docsUrl: "https://developers.cloudflare.com/ai-gateway/get-started/",
    apiKeyLabel: "Cloudflare API Token",
    apiKeyPlaceholder: "CF API token",
    requiresBaseUrl: true,
    baseUrlLabel: "Account ID",
    baseUrlPlaceholder: "Your Cloudflare account ID",
    notes: "Find your Account ID in the Cloudflare dashboard sidebar.",
  },
  {
    id: "vercel",
    displayName: "Vercel AI Gateway",
    docsUrl: "https://vercel.com/docs/ai",
    apiKeyLabel: "API Key",
    apiKeyPlaceholder: "Bearer token",
    requiresBaseUrl: true,
    baseUrlLabel: "Gateway URL",
    baseUrlPlaceholder: "https://...",
    baseUrlDefault: "https://api.v0.dev/v1",
    notes: "The Vercel AI Gateway is OpenAI-compatible. Set the URL to your gateway endpoint.",
  },
  {
    id: "vertex",
    displayName: "Google Vertex AI",
    docsUrl: "https://cloud.google.com/vertex-ai/docs/authentication",
    apiKeyLabel: "Access Token or Service Account JSON",
    apiKeyPlaceholder: "Paste access token or service account JSON",
    requiresBaseUrl: false,
    notes: "Paste a short-lived access token or the full JSON content of a service account key file.",
  },
  {
    id: "bedrock",
    displayName: "AWS Bedrock",
    docsUrl: "https://docs.aws.amazon.com/bedrock/latest/userguide/security-iam.html",
    apiKeyLabel: "Credentials (JSON)",
    apiKeyPlaceholder: '{"accessKeyId":"...","secretAccessKey":"...","region":"us-east-1"}',
    requiresBaseUrl: false,
    notes: 'Provide JSON with accessKeyId, secretAccessKey, and optionally region (default: us-east-1).',
  },
];

// ─── Tooltip / info icon ──────────────────────────────────────────────────────

interface InfoTooltipProps {
  docsUrl: string;
  providerName: string;
}

function InfoTooltip({ docsUrl, providerName }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const label = `How to obtain an API key for ${providerName}`;

  return (
    <span className="llm-info-tooltip-wrap">
      <a
        href={docsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="llm-info-icon"
        aria-label={label}
        title={label}
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onFocus={() => setVisible(true)}
        onBlur={() => setVisible(false)}
        onClick={(e) => e.stopPropagation()}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" width="15" height="15" aria-hidden="true">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-13h-2v2h2V7zm0 4h-2v6h2v-6z" />
        </svg>
      </a>
      {visible && (
        <span className="llm-tooltip" role="tooltip">
          {label}
        </span>
      )}
    </span>
  );
}

// ─── Single provider row ──────────────────────────────────────────────────────

type ProviderStatus = "idle" | "testing" | "success" | "error";

interface ProviderRowProps {
  info: ProviderInfo;
  onSaved: () => void;
}

function ProviderRow({ info, onSaved }: ProviderRowProps) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState(info.baseUrlDefault ?? "");
  const [label, setLabel] = useState(`${info.displayName} key`);
  const [model, setModel] = useState("");
  const [status, setStatus] = useState<ProviderStatus>("idle");
  const [message, setMessage] = useState("");
  const [credentialId, setCredentialId] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const canTest = apiKey.trim().length > 0;

  async function saveCredential(): Promise<string | null> {
    const secretObj: Record<string, string> = { apiKey: apiKey.trim() };
    if (baseUrl.trim()) secretObj.baseUrl = baseUrl.trim();
    if (model.trim()) secretObj.model = model.trim();

    const res = await fetch("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getCsrfHeader() },
      body: JSON.stringify({
        kind: "MODEL_PROVIDER",
        provider: info.id,
        label: label.trim() || `${info.displayName} key`,
        secret: JSON.stringify(secretObj),
      }),
    });

    if (!res.ok) return null;
    const body = (await res.json()) as { credential?: { id?: string }; id?: string };
    return body?.credential?.id ?? body?.id ?? null;
  }

  async function handleTest(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canTest) return;
    setStatus("testing");
    setMessage("");

    try {
      // Save first so the test route can decrypt the credential
      const savedId = credentialId ?? await saveCredential();
      if (!savedId) {
        setStatus("error");
        setMessage("Failed to save credential. Check encryption key configuration.");
        return;
      }
      setCredentialId(savedId);

      const res = await fetch("/api/model-providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getCsrfHeader() },
        body: JSON.stringify({ credentialId: savedId, provider: info.id }),
      });

      const data = (await res.json()) as { ok?: boolean; message?: string };
      if (data.ok) {
        setStatus("success");
        setMessage(data.message ?? "Connection verified.");
        setSaved(true);
        onSaved();
      } else {
        setStatus("error");
        setMessage(data.message ?? "Connection failed.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error — check your connection.");
    }
  }

  return (
    <div className={`llm-provider-row${open ? " llm-provider-row--open" : ""}${saved ? " llm-provider-row--saved" : ""}`}>
      <button
        type="button"
        className="llm-provider-header"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        id={`llm-provider-toggle-${info.id}`}
      >
        <span className="llm-provider-name">{info.displayName}</span>
        <span className="llm-provider-badges">
          {saved && <span className="badge badge-success">Configured</span>}
          <span className="llm-chevron" aria-hidden="true">{open ? "▲" : "▼"}</span>
        </span>
      </button>

      {open && (
        <form
          className="llm-provider-body"
          onSubmit={(e) => { void handleTest(e); }}
          aria-labelledby={`llm-provider-toggle-${info.id}`}
        >
          <label className="llm-field-label">
            Label
            <input
              className="llm-field-input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={`${info.displayName} key`}
            />
          </label>

          <label className="llm-field-label">
            <span className="llm-field-label-row">
              {info.apiKeyLabel}
              <InfoTooltip docsUrl={info.docsUrl} providerName={info.displayName} />
            </span>
            <input
              className="llm-field-input"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={info.apiKeyPlaceholder}
              required
            />
          </label>

          {info.requiresBaseUrl && (
            <label className="llm-field-label">
              {info.baseUrlLabel ?? "Base URL"}
              <input
                className="llm-field-input"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={info.baseUrlPlaceholder ?? "https://..."}
              />
            </label>
          )}

          <label className="llm-field-label">
            Default model <span className="llm-optional">(optional)</span>
            <input
              className="llm-field-input"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. gpt-4o-mini"
            />
          </label>

          {info.notes && (
            <p className="llm-notes">{info.notes}</p>
          )}

          <div className="llm-provider-actions">
            <button
              type="submit"
              className={`button${status === "testing" ? "" : " button-primary"}`}
              disabled={!canTest || status === "testing"}
            >
              {status === "testing" ? "Testing…" : "Test & Save"}
            </button>
            {status === "success" && (
              <span className="llm-status llm-status--success">✓ {message}</span>
            )}
            {status === "error" && (
              <span className="llm-status llm-status--error">✗ {message}</span>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

interface OnboardingLLMSelectorProps {
  /** Called when the user clicks "Continue" after configuring at least one provider */
  onComplete: () => void;
  /** Called when the user skips this step */
  onSkip: () => void;
}

export function OnboardingLLMSelector({ onComplete, onSkip }: OnboardingLLMSelectorProps) {
  const [savedCount, setSavedCount] = useState(0);

  const handleProviderSaved = useCallback(() => {
    setSavedCount((c) => c + 1);
  }, []);

  return (
    <div className="llm-selector">
      <p className="eyebrow">Step 2 of 2</p>
      <h1 className="llm-selector-title">Connect an AI provider</h1>
      <p className="setup-copy">
        Pasa Trader uses a language model to synthesise evidence and generate proposed trades.
        Configure at least one provider below — you can add or change providers later in Settings.
      </p>

      <div className="llm-provider-list">
        {PROVIDERS.map((info) => (
          <ProviderRow
            key={info.id}
            info={info}
            onSaved={handleProviderSaved}
          />
        ))}
      </div>

      <div className="llm-selector-footer">
        {savedCount > 0 && (
          <button
            type="button"
            className="button button-primary"
            onClick={onComplete}
          >
            Continue →
          </button>
        )}
        <button
          type="button"
          className="button button-ghost"
          onClick={onSkip}
        >
          {savedCount > 0 ? "Skip remaining providers" : "Skip for now — configure in Settings"}
        </button>
      </div>
    </div>
  );
}
