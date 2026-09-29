# Security

SASH Ocean is designed as critical-infrastructure software: it holds commercially
sensitive exposure data, may ingest customer sensor feeds from offshore installations, and
produces intelligence that people act on. Integrity and provenance matter as much as
confidentiality.

## Threat model (summary)

| Threat | Mitigations |
|---|---|
| Credential stuffing / brute force | Argon2id hashing, per-IP login rate limit (app + Nginx), account lockout (5 failures → 15 min), MFA (TOTP) |
| Token theft / replay | Short-lived JWT (60 min), typed tokens (MFA challenge ≠ access), issuer/exp validation, HTTPS + HSTS |
| API key leakage | Keys hashed (SHA-256) with a lookup prefix, shown once, expiry, revocation, per-key rate limits, audit of every API-key call |
| Privilege escalation | RBAC per endpoint (ADMIN/ANALYST/CUSTOMER/API_USER/SENSOR), tier entitlements, organisation scoping of watchlists, SENSOR role limited to ingestion |
| Data tampering / evidence rewriting | Append-only `ais_observations`, `sensor_observations`, `audit_log` enforced by DB triggers; provenance on every record; config hash on every risk result |
| Poisoned or spoofed feeds | Input validation (ranges, identifiers, future timestamps), source registry with confidence, live/synthetic isolation, identity-consistency and position-discontinuity checks surfaced to analysts (never auto-accusation) |
| Edge upload abuse | SENSOR-role keys, idempotent dedup keys, 10k items per batch, 10 MB body limit, bounded gzip decompression (zip-bomb safe) |
| Injection / XSS | SQLAlchemy parameter binding, Pydantic validation, React escaping, strict CSP (`script-src 'self'`), no inline scripts |
| Clickjacking / MIME sniffing | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff` |
| Denial of service | Nginx `limit_req`, app rate limits, request size limits, bounded queries (`limit` caps) |
| Supply chain | Pinned dependencies, pip-audit + npm audit + Trivy in CI, minimal base images |
| Container breakout / lateral movement | Non-root users, read-only root FS (api/worker/redis), `cap_drop: ALL`, `no-new-privileges`, segmented networks, DB/Redis unexposed, `/metrics` not routed publicly |

## Controls implemented

- **TLS**: Nginx gateway terminates TLS 1.2/1.3 on 8443; HSTS when served over HTTPS;
  optional HTTP→HTTPS redirect (`SASH_FORCE_HTTPS`). Development certificates are generated
  at runtime by a one-shot container and never baked into images.
- **Authentication**: email/password (Argon2id), JWT access tokens, TOTP MFA
  (`/v1/auth/mfa/*`), API keys for machine clients. Designed for migration to Keycloak/OIDC:
  role and tier claims map to OIDC roles/groups, API keys to OAuth2 client credentials.
- **Authorisation**: `require_roles` / `require_feature` dependencies on every router;
  COMMUNITY tier receives incident data with a 72 h delay.
- **Audit logging**: every mutating request, every API-key request, logins (success,
  failure, lockout), MFA events, report and dataset exports, alert acknowledgements and API
  key issuance/revocation — with actor, IP, user agent, path and status. Written in a
  separate transaction so failures are also recorded.
- **Secrets**: only via environment / secret stores; `scripts/init-env.sh` generates strong
  values; `.env` is git-ignored and created with mode 600. The API refuses to start in
  production without a strong JWT secret.
- **Secure headers**: API responses carry `nosniff`, `DENY`, `no-referrer`, a restrictive
  CSP and `Cache-Control: no-store`; the SPA is served with a strict CSP.
- **Input validation**: Pydantic models with bounds for all bodies/queries; GeoJSON validity
  checks; CSV import size limit (5 MB).
- **Dependency scanning**: `pip-audit`, `npm audit` and Trivy run in CI. At the time of
  writing both dependency sets report **no known vulnerabilities** (MapLibre was upgraded to
  6.11.2 for GHSA-jrc7-96c5-q579; FastAPI/Starlette, PyJWT and python-multipart were upgraded
  past their 2025–2026 advisories).
- **Container hardening**: see `docker-compose.yml` (`x-hardening`).

## Analytical safety

The platform must not produce unsupported accusations. Code and tests enforce that:
AIS gaps are "AIS reporting anomalies" with possible benign causes listed; uncorrelated
sensor contacts are "UNIDENTIFIED MARITIME CONTACT", never "hostile"; recommended actions
are analyst actions (verify, investigate, contact operations/security personnel) — the
tests assert that alert actions contain no kinetic language.

## Known gaps / roadmap

- Access token in `sessionStorage` (mitigated by strict CSP); move to httpOnly, SameSite
  cookies with CSRF protection or OIDC PKCE with a BFF.
- No refresh tokens / session revocation list yet (tokens expire after 60 min).
- mTLS and per-node certificates for edge nodes; signed observation batches (HMAC/Ed25519).
- Field-level encryption for customer-confidential fleet data; KMS-managed keys.
- Formal penetration test, IEC 62443 / ISO 27001 alignment for offshore deployments.

## Reporting a vulnerability

Please report privately to the maintainers (security contact to be defined by the
operating organisation) rather than opening a public issue.
