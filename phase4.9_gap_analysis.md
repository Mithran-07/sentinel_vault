# Phase 4.9 gap analysis — implementation checkpoint

Status: **Implementation in progress — blocked by unavailable AWS KMS environment**

## Verified KMS boundary

`server/src/lib/kms.ts` uses AWS SDK v3 (`@aws-sdk/client-kms`) and the SDK's
default credential provider chain. It requires `AWS_REGION` and
`AWS_KMS_KEY_ID`; it does not accept application-supplied AWS credentials.

OIDC client secrets are stored as a versioned AWS KMS ciphertext and use the
same non-secret encryption context on encryption and decryption:

- `purpose=oidc-client-secret`
- `providerId=<IdentityProvider.id>`

The OIDC routes do not use `lib/mfa.ts` or its development AES implementation.
KMS configuration, KMS access, missing ciphertext, and decryption errors fail
closed. API responses never include the stored ciphertext or decrypted secret.

## External prerequisite

The current process environment has neither `AWS_REGION` nor `AWS_KMS_KEY_ID`.
It consequently cannot use the approved customer-managed key or validate the
IAM credential chain. Real OIDC configuration, KMS encryption/decryption, and
authenticated OIDC integration tests must remain blocked until a deployment or
development profile supplies:

```text
AWS_REGION=<deployment region>
AWS_KMS_KEY_ID=alias/zero-knowledge-sso
```

The workload identity must have only `kms:Encrypt`, `kms:Decrypt`, and
`kms:DescribeKey` on that key. Static access keys must not be committed or
placed in project configuration.

## Static implementation completed at this checkpoint

- Added additive Prisma models and migration for `SsoTransaction`,
  `SsoIdentity`, `SamlAssertionReplay`, and `IdpAttributeMapping`.
- OIDC initiation now writes a five-minute, server-side, one-time transaction
  containing the provider, organization, state, nonce, and PKCE verifier.
  Callback processing derives the provider only from that transaction and
  atomically consumes it before session creation.
- OIDC uses one fixed callback URL; callback parameters can no longer select an
  organization or provider.
- Existing accounts are resolved by the unique `(providerId, subject)` SSO
  identity. A matching email without that identity is rejected, eliminating
  email-only automatic account takeover. New JIT accounts receive only the
  default member membership and `cryptoSetupPending=true`.
- SSO session creation now calls the existing concurrent-session enforcement,
  persists device metadata, checks active membership/suspension, and evaluates
  organization policies; a denied session and its refresh token are revoked.
- SAML now uses node-saml's mandatory `InResponseTo` validation with a
  database-backed, provider-bound request cache and stores assertion IDs in a
  provider-bound unique replay table.
- SSO callback redirects no longer put access or refresh tokens in URLs.

## Remaining security-critical implementation work

The existing Phase 4.9 implementation is incomplete and must not be enabled as
complete SSO yet. Static review identified these required items:

1. Complete the client SSO entry, callback, split local unlock, and JIT local
   cryptographic setup flows. No SSO UI or callback page currently exists.
2. Implement configuration APIs for approved attribute mappings and explicit,
   auditable group mapping rules. The schema exists; mappings are deliberately
   not applied implicitly.
3. Replace the current placeholder Phase 4.9 tests with coverage for the
   required SAML, OIDC, linkage, policy, and zero-knowledge cases.
4. Exercise and review IdP-initiated SAML separately; the current hardening
   implements SP-initiated request correlation and rejects uncorrelated ACS
   responses through `validateInResponseTo=always`.

## Current verification

- Server TypeScript check: passed after the KMS module addition.
- Client TypeScript check: passed.
- Client production build: passed.
- Real KMS/OIDC integration tests: blocked by the missing AWS configuration.
- Full Phase 4.9 and full-regression certification: not run and not claimed.
