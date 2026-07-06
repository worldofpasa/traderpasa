"use client";

import { useEffect, useState, type SyntheticEvent } from "react";
import { getCsrfHeader } from "../csrf-client";

interface CredentialSummary {
  id: string;
  kind: string;
  provider: string;
  label: string;
  updatedAt: string;
}

type FormState =
  | { status: "idle" | "submitting"; message?: string }
  | { status: "error" | "success"; message: string };

interface Props {
  addToast?: (message: string, type?: "success" | "error" | "info" | "warning") => void;
  showConfirm?: (
    message: string,
    onConfirm: () => void,
    options?: { title?: string; danger?: boolean }
  ) => void;
}

// Well-known OpenAI-compatible providers and their defaults
const MODEL_PROVIDER_PRESETS: Record<string, { baseUrl: string; exampleModel: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", exampleModel: "gpt-4o-mini" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", exampleModel: "claude-haiku-4-5-20251001" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", exampleModel: "anthropic/claude-3.5-sonnet" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", exampleModel: "llama-3.1-70b-versatile" },
  together: { baseUrl: "https://api.together.xyz/v1", exampleModel: "meta-llama/Llama-3-70b-chat-hf" },
  ollama: { baseUrl: "http://localhost:11434/v1", exampleModel: "llama3.2" },
  lmstudio: { baseUrl: "http://localhost:1234/v1", exampleModel: "local-model" },
};

const BROKER_PROVIDER_LABELS: Record<string, string> = {
  alpaca: "Alpaca",
  ibkr: "Interactive Brokers",
};

export function CredentialsForm({ addToast, showConfirm }: Props) {
  const [credentials, setCredentials] = useState<CredentialSummary[]>([]);
  const [formState, setFormState] = useState<FormState>({ status: "idle" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedKind, setSelectedKind] = useState<string>("BROKER");
  const [selectedBrokerProvider, setSelectedBrokerProvider] = useState("alpaca");
  const [brokerKeyId, setBrokerKeyId] = useState("");
  const [brokerSecretKey, setBrokerSecretKey] = useState("");
  const [ibkrBaseUrl, setIbkrBaseUrl] = useState("https://localhost:5000/v1/api");
  const [ibkrSessionToken, setIbkrSessionToken] = useState("");
  const [ibkrPaperAccountId, setIbkrPaperAccountId] = useState("");
  const [ibkrLiveAccountId, setIbkrLiveAccountId] = useState("");
  // Model provider structured fields
  const [mpApiKey, setMpApiKey] = useState("");
  const [mpBaseUrl, setMpBaseUrl] = useState("");
  const [mpModel, setMpModel] = useState("");
  const [mpProviderName, setMpProviderName] = useState("");

  async function refreshCredentials() {
    const response = await fetch("/api/credentials");
    if (response.ok) {
      const body = (await response.json()) as { credentials: CredentialSummary[] };
      setCredentials(body.credentials);
    }
  }

  useEffect(() => {
    void refreshCredentials();
  }, []);

  function handlePresetChange(preset: string) {
    setMpProviderName(preset);
    const p = MODEL_PROVIDER_PRESETS[preset];
    if (p) {
      setMpBaseUrl(p.baseUrl);
      setMpModel(p.exampleModel);
    }
  }

  async function submitForm(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormState({ status: "submitting" });

    const form = event.currentTarget;
    const formData = new FormData(form);

    let secret: string;
    if (selectedKind === "MODEL_PROVIDER") {
      const secretObj: Record<string, string> = { apiKey: mpApiKey };
      if (mpBaseUrl.trim()) secretObj.baseUrl = mpBaseUrl.trim();
      if (mpModel.trim()) secretObj.model = mpModel.trim();
      secret = JSON.stringify(secretObj);
    } else if (selectedKind === "BROKER") {
      if (selectedBrokerProvider === "ibkr") {
        const secretObj: Record<string, string> = {
          baseUrl: ibkrBaseUrl.trim() || "https://localhost:5000/v1/api",
        };
        if (ibkrSessionToken.trim()) secretObj.sessionToken = ibkrSessionToken.trim();
        if (ibkrPaperAccountId.trim()) secretObj.paperAccountId = ibkrPaperAccountId.trim();
        if (ibkrLiveAccountId.trim()) secretObj.liveAccountId = ibkrLiveAccountId.trim();
        secret = JSON.stringify(secretObj);
      } else {
        secret = JSON.stringify({
          keyId: brokerKeyId.trim(),
          secretKey: brokerSecretKey.trim(),
        });
      }
    } else {
      secret = formData.get("secret") as string;
    }

    const response = await fetch("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getCsrfHeader() },
      body: JSON.stringify({
        kind: formData.get("kind"),
        provider: formData.get("provider"),
        label: formData.get("label"),
        secret,
      }),
    });

    if (!response.ok) {
      setFormState({ status: "error", message: "Credential save failed. Check the fields and encryption key configuration." });
      return;
    }

    form.reset();
    setBrokerKeyId("");
    setBrokerSecretKey("");
    setIbkrBaseUrl("https://localhost:5000/v1/api");
    setIbkrSessionToken("");
    setIbkrPaperAccountId("");
    setIbkrLiveAccountId("");
    setMpApiKey(""); setMpBaseUrl(""); setMpModel(""); setMpProviderName("");
    setFormState({ status: "success", message: "Credential saved. Plaintext is not returned after save." });
    await refreshCredentials();
  }

  async function handleDelete(id: string, label: string) {
    const performDelete = async () => {
      setDeletingId(id);
      try {
        const response = await fetch(`/api/credentials/${id}`, {
          method: "DELETE",
          headers: { ...getCsrfHeader() },
        });
        if (response.ok || response.status === 204) {
          if (addToast) addToast("Credential deleted successfully.", "success");
          await refreshCredentials();
        } else {
          if (addToast) addToast("Failed to delete credential.", "error");
        }
      } catch (err) {
        if (addToast) addToast("Failed to delete credential.", "error");
      } finally {
        setDeletingId(null);
      }
    };

    if (showConfirm) {
      showConfirm(
        `Delete credential "${label}"? This cannot be undone.`,
        performDelete,
        { title: "Delete Credential", danger: true }
      );
    } else {
      if (confirm(`Delete credential "${label}"? This cannot be undone.`)) {
        void performDelete();
      }
    }
  }

  return (
    <section className="settings-vault-grid">
      <form className="setup-form settings-form-card" onSubmit={(event) => { void submitForm(event); }}>
        <label>
          Type
          <select
            defaultValue="BROKER"
            name="kind"
            onChange={(e) => setSelectedKind(e.target.value)}
          >
            <option value="BROKER">Broker</option>
            <option value="MODEL_PROVIDER">Model provider</option>
            <option value="SOURCE_PROVIDER">Source provider</option>
            <option value="NOTIFICATION_PROVIDER">Notification provider</option>
          </select>
        </label>

        {selectedKind === "MODEL_PROVIDER" ? (
          <>
            <label>
              Provider name
              <input
                name="provider"
                value={mpProviderName}
                onChange={(e) => handlePresetChange(e.target.value)}
                placeholder="openai, anthropic, openrouter, ollama…"
                list="provider-presets"
                required
              />
              <span className="error-message">Provider name is required.</span>
              <datalist id="provider-presets">
                {Object.keys(MODEL_PROVIDER_PRESETS).map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              <small className="field-help">
                Any OpenAI-compatible provider. Choosing a preset fills in the URL and a default model.
              </small>
            </label>
            <label>
              Label
              <input name="label" placeholder="My OpenRouter key" required />
              <span className="error-message">Label is required.</span>
            </label>
            <label>
              API Key
              <input
                autoComplete="off"
                type="password"
                value={mpApiKey}
                onChange={(e) => setMpApiKey(e.target.value)}
                placeholder="sk-… / sk-ant-… / sk-or-…"
                required
              />
              <span className="error-message">API Key is required.</span>
            </label>
            <label>
              Base URL
              <input
                type="url"
                value={mpBaseUrl}
                onChange={(e) => setMpBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
              />
              <span className="error-message">Please enter a valid URL.</span>
              <small className="field-help">
                Leave blank for OpenAI / Anthropic defaults. Required for OpenRouter, Groq, Ollama, etc.
              </small>
            </label>
            <label>
              Model name
              <input
                value={mpModel}
                onChange={(e) => setMpModel(e.target.value)}
                placeholder="gpt-4o-mini"
              />
              <small className="field-help">
                Exact model ID the API accepts. Leave blank to use the provider default.
              </small>
            </label>
          </>
        ) : (
          <>
            <label>
              Provider
              {selectedKind === "BROKER" ? (
                <select
                  name="provider"
                  value={selectedBrokerProvider}
                  onChange={(e) => setSelectedBrokerProvider(e.target.value)}
                  required
                >
                  {Object.entries(BROKER_PROVIDER_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              ) : (
                <input
                name="provider"
                placeholder="provider-name"
                required
                />
              )}
              <span className="error-message">Provider is required.</span>
              {selectedKind === "BROKER" && (
                <small className="field-help">
                  Supported broker providers are Alpaca and Interactive Brokers.
                </small>
              )}
            </label>
            <label>
              Label
              <input
                name="label"
                placeholder={selectedKind === "BROKER" ? `${BROKER_PROVIDER_LABELS[selectedBrokerProvider]} credential` : "My credential"}
                required
              />
              <span className="error-message">Label is required.</span>
            </label>
            {selectedKind === "BROKER" && selectedBrokerProvider === "alpaca" ? (
              <>
                <label>
                  Alpaca Key ID
                  <input
                    autoComplete="off"
                    value={brokerKeyId}
                    onChange={(e) => setBrokerKeyId(e.target.value)}
                    placeholder="PKTEST..."
                    required
                  />
                  <span className="error-message">Alpaca Key ID is required.</span>
                </label>
                <label>
                  Alpaca Secret Key
                  <input
                    autoComplete="off"
                    type="password"
                    value={brokerSecretKey}
                    onChange={(e) => setBrokerSecretKey(e.target.value)}
                    placeholder="Secret key"
                    required
                  />
                  <span className="error-message">Alpaca Secret Key is required.</span>
                </label>
              </>
            ) : selectedKind === "BROKER" && selectedBrokerProvider === "ibkr" ? (
              <>
                <label>
                  IBKR Gateway Base URL
                  <input
                    autoComplete="off"
                    type="url"
                    value={ibkrBaseUrl}
                    onChange={(e) => setIbkrBaseUrl(e.target.value)}
                    placeholder="https://localhost:5000/v1/api"
                    required
                  />
                  <span className="error-message">Gateway URL is required.</span>
                  <small className="field-help">
                    Run and authenticate the IBKR Client Portal Gateway on the same host the app can reach.
                  </small>
                </label>
                <label>
                  API Session Token
                  <input
                    autoComplete="off"
                    type="password"
                    value={ibkrSessionToken}
                    onChange={(e) => setIbkrSessionToken(e.target.value)}
                    placeholder="Optional api cookie token"
                  />
                  <small className="field-help">
                    Optional for OAuth/session-token deployments. Leave blank for an authenticated local gateway.
                  </small>
                </label>
                <label>
                  Paper Account ID
                  <input
                    autoComplete="off"
                    value={ibkrPaperAccountId}
                    onChange={(e) => setIbkrPaperAccountId(e.target.value)}
                    placeholder="DU123456"
                  />
                  <small className="field-help">
                    Recommended so PAPER connections cannot accidentally select a live account.
                  </small>
                </label>
                <label>
                  Live Account ID
                  <input
                    autoComplete="off"
                    value={ibkrLiveAccountId}
                    onChange={(e) => setIbkrLiveAccountId(e.target.value)}
                    placeholder="U123456"
                  />
                  <small className="field-help">
                    Required before connecting a LIVE IBKR account.
                  </small>
                </label>
              </>
            ) : (
              <label>
                Secret (JSON)
                <input
                  autoComplete="off"
                  name="secret"
                  required
                  type="password"
                  placeholder='{"apiKey":"..."}'
                />
                <span className="error-message">Secret is required.</span>
              </label>
            )}
          </>
        )}

        <button className="button button-primary" disabled={formState.status === "submitting"} type="submit">
          {formState.status === "submitting" ? "Saving..." : "Save encrypted credential"}
        </button>
        {formState.status === "error" ? <p className="form-error">{formState.message}</p> : null}
        {formState.status === "success" ? <p className="form-success">{formState.message}</p> : null}
      </form>

      <div className="settings-list-card">
        <div className="settings-list-header">
          <h2>Saved Credentials</h2>
          <span>{credentials.length}</span>
        </div>
        {credentials.length === 0 ? (
          <p className="empty-text">No credentials saved yet.</p>
        ) : (
          credentials.map((credential) => (
            <article key={credential.id} className="credential-row">
              <div>
                <strong>{credential.label}</strong>
                <span>{credential.kind} / {credential.provider}</span>
                <small>Updated {new Date(credential.updatedAt).toLocaleString()}</small>
              </div>
              <button
                onClick={() => { void handleDelete(credential.id, credential.label); }}
                disabled={deletingId === credential.id}
                className="button button-danger button-sm"
              >
                {deletingId === credential.id ? "..." : "Delete"}
              </button>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
