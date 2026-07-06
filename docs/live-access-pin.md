# Live Access PIN

LIVE packet execution is gated by a secondary Live Access PIN (#94), in addition to the per-strategy live acknowledgment. A confirmation modal alone is not sufficient for real-money actions.

## Behavior

- The PIN (minimum 6 characters) is configured in **Settings → Live Trading Security** and stored as an argon2id hash on the `User` record (`liveAccessPinHash`). Plaintext is never persisted.
- Changing an existing PIN requires the current PIN.
- `POST /api/proposed-packets/[id]/execute` enforces the gate **server-side** whenever the packet's strategy has `executionMode = LIVE`:
  - `403 live_pin_not_configured` — no PIN is set; LIVE execution is locked until one is configured.
  - `403 invalid_live_pin` — missing or wrong `livePin` in the request body.
- PAPER execution is unaffected.
- The dashboard prompts for the PIN in the LIVE execution confirmation dialog; this prompt is advisory — enforcement lives in the API route.

## Audit trail

- `auth.live_pin_configured` / `auth.live_pin_changed` — PIN lifecycle.
- `auth.live_pin_verification_failed` — every failed verification attempt.

## API

- `GET /api/auth/live-pin` → `{ configured: boolean }`
- `POST /api/auth/live-pin` with `{ pin, currentPin? }` (session + CSRF protected)
