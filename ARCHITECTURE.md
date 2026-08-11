# Architecture Notes

Condensed version of the 5 design docs the original plan called for. Good
enough to talk through in an internship demo; not a substitute for the full
versions if you continue this project past the initial deadline.

## 1. Threat model (summary)

**In scope / defended against:**
- Database compromise — attacker gets only ciphertext, Argon2id-hashed auth
  values, and metadata. No plaintext passwords, no vault keys.
- Network interception — TLS in transit (assumed at deploy time), plus the
  server never sees plaintext regardless.
- Server operator / malicious admin — zero-knowledge means even Anthropic-you-
  running-this-server can't read vault contents.

**Out of scope for this demo (would need real work before production):**
- Compromised client (malware/keylogger on the user's device) — no client-side
  encryption scheme defends against this.
- Brute-force login attempts — needs rate limiting / account lockout, not yet built.
- Session/token theft (XSS) — access token sits in `sessionStorage`; a real
  build should evaluate httpOnly cookies + CSRF protections instead.

## 2. Cryptographic architecture

```
Master Password + Salt --Argon2id (64MB, t=3, p=4)--> Master Key (32 bytes)
Master Key --SHA-256, domain-separated "vault-auth-v1"--> Auth Hash --sent to server--
Vault Key --crypto.getRandomValues, 32 bytes, generated once--
Vault Key encrypted under Master Key (AES-256-GCM) --> stored server-side, opaque
Each vault item encrypted under Vault Key (AES-256-GCM) --> stored server-side, opaque
```

The server additionally re-hashes the client's Auth Hash with Argon2id before
storing it (`argon2.hash` in `routes/auth.ts`) — a second layer, so a DB leak
alone still isn't directly usable even against the auth value.

KDF parameters (memory/iterations/parallelism) are stored per-user so they can
be upgraded over time without breaking existing accounts (rotate-forward, not
retroactive).

## 3. Database schema

Implemented in `server/prisma/schema.prisma`. Key point: no table has a
plaintext-secret column. `VaultItem.ciphertext` is a single opaque blob per
item — name, username, password, notes, everything — encrypted together
client-side.

## 4. API surface

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/auth/kdf?email=` | none | Prelogin — fetch KDF params to derive keys before login |
| `POST /api/auth/register` | none | Create account (server never sees password) |
| `POST /api/auth/login` | none | Verify Auth Hash, issue tokens + encrypted vault key |
| `POST /api/auth/refresh` | refresh token | Rotate access token |
| `POST /api/auth/logout` | — | Revoke refresh token |
| `GET/POST/PUT/DELETE /api/vault/items` | bearer | Vault item CRUD (ciphertext only) |
| `GET/POST/DELETE /api/folders` | bearer | Folder CRUD (encrypted names) |
| `GET /api/audit`, `GET /api/audit/verify` | bearer | Hash-chained audit log + integrity check |

## 5. Enterprise feature specification (roadmap, not built)

Shown in-app at `/enterprise`. If you had another 2–3 weeks, build order would be:
1. Organizations + Collections (group vault items, share by collection not by item)
2. RBAC (roles → permissions → collections)
3. SSO via OIDC (start with Google Workspace, it's the least SAML pain)
4. SCIM provisioning
5. SIEM export (start with a JSON webhook, add Splunk/CEF formatting later)

Each of these is a genuinely large effort on its own — worth saying explicitly
in a demo rather than implying they're "almost done."
