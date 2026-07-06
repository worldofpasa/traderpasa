# Broker Provider Guide

Pasa Trader Platform supports internal broker adapters behind the `BrokerAdapter` contract. UI and agents must not call brokers directly. API and worker flows must resolve a saved broker account, run deterministic risk validation, and execute only through `packages/core/src/execution.ts`.

## Supported Brokers

### Alpaca

Provider id: `alpaca`

Credential secret JSON:

```json
{
  "keyId": "PKTEST...",
  "secretKey": "..."
}
```

Alpaca supports PAPER and LIVE environments through separate API base URLs. Paper credentials must only be connected to PAPER broker accounts, and live credentials must only be connected to LIVE broker accounts.

### Interactive Brokers

Provider id: `ibkr`

Credential secret JSON:

```json
{
  "baseUrl": "https://localhost:5000/v1/api",
  "paperAccountId": "DU123456",
  "liveAccountId": "U123456",
  "sessionToken": "optional-api-cookie-token"
}
```

IBKR individual-client Web API access uses the Client Portal Gateway. Run and authenticate the gateway on a host reachable by the web/worker processes before testing or connecting the credential. IBKR documents the default gateway API path as `/v1/api`, the `/tickle` session endpoint, account listing through `/portfolio/accounts` and `/iserver/accounts`, and order submission through `/iserver/account/{accountId}/orders`.

Operational notes:

- `paperAccountId` and `liveAccountId` are strongly recommended so PAPER and LIVE accounts cannot be mixed by account-list ordering.
- The adapter resolves stock `conid` values from symbols before submitting orders.
- Prompt-style IBKR order replies are treated as rejected. The platform does not auto-confirm broker prompts.
- Trailing stop placement is currently disabled for IBKR in this adapter and returns a rejected stop result.
- LIVE execution still requires the platform live acknowledgment flow.

Official references:

- https://www.interactivebrokers.com/campus/ibkr-api-page/webapi-doc/
- https://www.interactivebrokers.com/campus/ibkr-api-page/cpapi-v1/

## Adding Another Broker Provider

1. Add the provider id to `brokerProviderSchema` in `packages/schemas/src/schemas.ts`.
2. Add a credential secret schema in `packages/schemas/src/schemas.ts`. Keep plaintext values inside encrypted credential storage only.
3. Implement `BrokerAdapter` in `packages/adapters/src/<provider>/<provider>-broker.ts`.
4. Export the adapter from `packages/adapters/src/index.ts`.
5. Register the adapter in `makeBrokerAdapter` in `packages/core/src/broker-accounts.ts`.
6. Update the credential UI in `apps/web/src/app/credentials/credentials-form.tsx`.
7. Add adapter contract tests and provider-specific adapter tests.
8. Add core tests proving the provider id routes to the correct adapter.
9. Document provider setup, credential JSON, paper/live behavior, unsupported capabilities, and broker-specific safety limits in this file.
10. Update `prd.md`, `erd.md`, and deployment docs if the provider changes product scope, execution capabilities, setup steps, or safety posture.

Provider acceptance checklist:

- Account status, snapshots, capabilities, order submission, and open order lookup are implemented or explicitly hard-blocked.
- Broker downtime causes execution to block and requires revalidation before a later attempt.
- Unsupported order types, shorting, fractional shares, and trailing stops are surfaced as risk hard blocks or rejected broker results.
- No broker call is reachable from UI code or agent code.
- No raw broker response enters execution flow without adapter normalization.
- Paper/live environment labels remain visible in account, strategy, review, order, audit, and notification flows.
