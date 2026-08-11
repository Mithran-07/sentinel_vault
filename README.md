# Vault — Zero-Knowledge Password Manager (Demo)

A working, scoped-down implementation of the enterprise password vault plan.
Built for a few days' timeline: **the crypto core, auth, and vault CRUD are real
and functional.** Enterprise features (SSO/SCIM/RBAC/SIEM) are shown as a
labeled roadmap page rather than built — see `ARCHITECTURE.md` for why and
what a real build-out would take.

## What's actually implemented

- **Zero-knowledge client-side encryption** — Argon2id key derivation, AES-256-GCM
  vault encryption, all in the browser. The server only ever stores ciphertext.
- **Auth** — email + master password, with authentication cryptographically
  separated from vault encryption (same model Bitwarden uses).
- **Vault CRUD** — add/edit/delete logins with a generator + strength meter.
- **Tamper-resistant audit log** — SHA-256 hash-chained events with a chain
  verification endpoint.
- **Password health dashboard** — reused/weak/stale password detection,
  computed entirely client-side from already-decrypted items. Nothing is
  sent to the server to run this check.
- **Enterprise roadmap page** — clearly labeled "Planned", not faked as working.

## Stack

Next.js 14 + TypeScript (client) · Express + TypeScript + Prisma (server) · PostgreSQL

## Running it locally

### 1. Database
```bash
docker compose up -d          # starts Postgres on :5432
```

### 2. Server
```bash
cd server
cp .env.example .env          # edit if you changed DB credentials
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev                   # http://localhost:4000
```

### 3. Client
```bash
cd client
npm install
npm run dev                   # http://localhost:3000
```

Open http://localhost:3000, create an account, and add a login. Refreshing
the page locks the vault (the Vault Key lives only in memory) — that's
intentional, not a bug; see `ARCHITECTURE.md`.

## Project layout

```
server/   Express API — auth, vault items, folders, audit log
client/   Next.js app — all crypto happens here, never on the server
docs/     (add your own) — threat model, schema, API spec notes live in ARCHITECTURE.md for now
```

## Known gaps (be upfront about these in your internship demo)

- No password reset flow — by design (zero-knowledge means there's nothing to reset to), but worth mentioning you know that trade-off exists.
- No rate limiting / brute-force lockout on `/auth/login` yet.
- No sharing, organizations, or attachments.
- Prisma client requires running `prisma generate` with real network access to `binaries.prisma.sh` — if your environment blocks that domain, this will fail; on a normal laptop/cloud VM it won't.
