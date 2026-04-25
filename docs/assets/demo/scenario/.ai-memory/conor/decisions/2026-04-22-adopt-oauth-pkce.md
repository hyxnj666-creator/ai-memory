# Adopt OAuth 2.0 authorization code flow with PKCE for the customer portal SPA

> **Date**: 2026-04-22  
> **Author**: conor  
> **Source**: cursor:9b3c1e2a  
> **Conversation**: Auth flow review for the customer portal SPA

---

**Context**: The customer portal SPA currently uses OAuth 2.0 implicit flow, which puts the access token in the URL fragment. Security review flagged this as deprecated by RFC 8252 and prone to leakage via Referer headers, browser history, and proxy logs.

**Content**: Switch the SPA to OAuth 2.0 authorization code flow with PKCE (Proof Key for Code Exchange). Retire the implicit-flow client config. Require HTTPS-only redirect URIs. Migration is gated behind a feature flag; deprecate the old client_id by end of quarter.

**Reasoning**: PKCE keeps the access token off the URL (auth code is the only thing exchanged via the front channel), and our existing `oauth4webapi` library supports PKCE out of the box. The migration is a few lines per auth provider plus an extra round-trip on first login — acceptable for the security gain.

**Alternatives**: Stay on implicit flow ("works today") rejected: deprecated since 2019, security review will not sign off. Custom auth backend rejected: high cost, no incremental benefit over PKCE.

**Impact**: One additional round-trip on first login (cookie set after token exchange). All downstream services that validate tokens are unaffected; same JWT shape, same audience.
