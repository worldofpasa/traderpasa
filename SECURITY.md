# Security Policy

## Threat Model

TraderPasa is designed for **single-operator, self-hosted use** on a trusted network (LAN or VPN). It holds AES-256-GCM encrypted broker credentials and can place live orders. Treat it accordingly:

- Do not expose the app to the public internet without TLS and a completed admin setup.
- Complete `/setup` immediately after installation — the setup endpoint is open until the first admin account is created.
- The `CREDENTIAL_ENCRYPTION_KEY` is the master secret. Back it up. Losing it makes all stored broker and model credentials unreadable.

## Reporting a Vulnerability

Please do **not** open a public GitHub issue for security vulnerabilities.

Use GitHub's [private vulnerability reporting](https://github.com/worldofpasa/traderpasa/security/advisories/new) to disclose securely. We aim to acknowledge reports within 48 hours and resolve critical issues within 14 days.

## Supported Versions

Only the latest release on `main` receives security fixes.

## In-Scope

- Credential encryption/decryption (AES-256-GCM in `packages/core`)
- Authentication and session handling
- CSRF and origin validation
- Risk engine bypasses (hard blocks on live trading)
- Execution gates (live trading requires explicit acknowledgment)
- Unintended exposure of broker API keys or the encryption key

## Out of Scope

- Vulnerabilities requiring physical access to the host
- Attacks requiring the attacker to already control the host OS
- Denial of service against a self-hosted instance
- Issues in upstream dependencies (report to the upstream project)
