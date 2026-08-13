# Phase 4.9 static-security checkpoint

Status: **Implementation in progress — blocked by AWS KMS configuration/IAM access**

## Completed implementation

- AWS KMS-only OIDC client-secret storage with provider-bound encryption context.
- Fail-closed KMS configuration, key-access, encryption, and decryption paths.
- Additive schema/migration for one-time SSO transactions, provider-subject
  identities, SAML assertion replay records, and attribute mappings.
- OIDC authorization-code transaction binding for provider, organization,
  state, nonce, PKCE verifier, expiry, and one-time consumption.
- Provider-subject account linking; email collisions cannot silently link or
  hijack existing accounts.
- JIT accounts have pending cryptographic setup and receive no privileged role.
- SAML uses node-saml signature validation plus mandatory `InResponseTo` with a
  persistent provider-bound request cache and a durable replay barrier.
- SSO-created sessions use concurrent session enforcement, device metadata,
  suspension/membership checks, and organization policy evaluation.
- No SSO token is placed in a callback URL.

## Static verification passed

- `server: npx tsc --noEmit`
- `server: npx prisma validate`
- `client: npx tsc --noEmit`
- `client: npm run build`

## Tests intentionally blocked

No real AWS KMS, authenticated OIDC, or full Phase 4.9 certification test was
run. The process environment has no `AWS_REGION` or `AWS_KMS_KEY_ID`, and no
approved IAM credential-chain access. No KMS fallback, fake KMS response, or
test-only production bypass was introduced.

## Exact prerequisite

```text
AWS_REGION=<deployment region>
AWS_KMS_KEY_ID=alias/zero-knowledge-sso
```

The deployment role/profile must grant only `kms:Encrypt`, `kms:Decrypt`, and
`kms:DescribeKey` for that customer-managed symmetric key.

## Verified invariants

The server does not receive vault master passwords, MEK/VEK, collection keys,
vault plaintext, or plaintext user private keys. AWS KMS is limited to OIDC
client-secret material; plaintext client secrets are memory-only for code
exchange and are neither persisted, returned, nor logged.
