"use client";

const EXAMPLE_PROMPTS = [
  "A news analyst that summarizes macro headlines and ties them to my watchlist symbols.",
  "A conservative risk debator that challenges aggressive position sizing with concentration concerns.",
  "A bull researcher that builds the strongest long thesis from upstream analyst reports.",
];

export function AgentBuilderPlaceholder() {
  return (
    <div className="agents-builder-placeholder">
      <header className="agents-builder-header">
        <div>
          <p className="agents-builder-eyebrow">Coming soon</p>
          <h3>Agent Builder</h3>
          <p className="agents-builder-intro">
            Describe an agent in plain language. Pasa will draft its role, prompts, variables,
            evidence requirements, and output schema for review before you add it to a strategy team.
          </p>
        </div>
      </header>

      <label className="agents-builder-field">
        <span>Describe your agent</span>
        <textarea
          disabled
          rows={5}
          placeholder="e.g. A fundamentals analyst that reviews balance sheet and cash flow evidence, flags missing filings, and outputs structured claims with confidence scores."
          className="agents-builder-textarea"
        />
      </label>

      <div className="agents-builder-actions">
        <button type="button" className="button button-primary" disabled title="Agent Builder coming soon">
          Generate agent
        </button>
        <span className="agents-builder-note">
          Natural-language agent creation is not available yet. Use the catalog or manual form for now.
        </span>
      </div>

      <div className="agents-builder-examples">
        <h4>Example prompts</h4>
        <ul>
          {EXAMPLE_PROMPTS.map((prompt) => (
            <li key={prompt}>
              <span className="agents-builder-example-text">{prompt}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
