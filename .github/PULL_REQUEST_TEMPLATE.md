## Summary

<!-- What does this change and why? -->

## Changes

<!-- Bullet list of notable changes -->

## Testing

<!-- What did you run? -->

- [ ] `pnpm test`
- [ ] `pnpm test:integration`
- [ ] `pnpm test:e2e`
- [ ] `pnpm typecheck`
- [ ] `pnpm lint`

## Safety checklist

- [ ] Does not weaken any safety invariant (AI never executes trades / places stops / validates risk; hard risk blocks non-overridable; live trading requires acknowledgment; plaintext credentials never persisted).
- [ ] If this touches auth, credential encryption, or the risk engine, I have added tests and flagged it for review.
- [ ] Docs updated (env vars, runbooks) if behavior changed.
