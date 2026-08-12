# Enterprise-Grade Password Vault Master Plan

This document serves as the master specification, architectural blueprint, and implementation plan for building an enterprise-grade password vault. This system combines a password manager, zero-knowledge encrypted storage system, IAM platform, secrets-management system, enterprise administration console, multi-platform clients, audit/SIEM platform, and cryptographic key-management system.

---

## 1. Reference Implementations for Study
Study these open-source implementations to understand different parts of the system:
* **Bitwarden Server**: Primary reference for authentication, sharing, encryption model, identity, SSO, SCIM, and DB structure.
* **Vaultwarden**: Excellent for understanding Rust backend architecture, WebAuthn, attachments, and API design in a compact implementation.
* **Passbolt**: Enterprise collaboration reference for team sharing, groups, permissions, and auditability.
* **Psono**: Reference for client-side encryption separating the browser extension, server, and PostgreSQL database.
* **Infisical**: Study for developer secrets management (API keys, DB credentials, secret rotation).
* **HashiCorp Vault**: Reference for enterprise secrets architecture, secret engines, dynamic credentials, and token lifecycle.

---

## 2. High-Level Architecture
```text
                    ┌─────────────────────┐
                    │   Web Application    │
                    │   React / Next.js    │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Browser Extension   │
                    └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │ Mobile / Desktop    │
                    └──────────┬──────────┘
                               │
                         HTTPS / TLS
                               │
                    ┌──────────▼──────────┐
                    │      API Gateway     │
                    └──────────┬──────────┘
                               │
             ┌─────────────────┼──────────────────┐
             │                 │                  │
       ┌─────▼─────┐    ┌─────▼─────┐     ┌─────▼─────┐
       │ Identity  │    │ Vault API  │     │ Admin API │
       │ Service   │    │ Service    │     │ Service   │
       └─────┬─────┘    └─────┬─────┘     └─────┬─────┘
             │                │                  │
             └────────────────┼──────────────────┘
                              │
                    ┌─────────▼─────────┐
                    │ PostgreSQL        │
                    │ Metadata only     │
                    └───────────────────┘

                    ┌───────────────────┐
                    │ Object Storage    │
                    │ Encrypted files   │
                    └───────────────────┘

                    ┌───────────────────┐
                    │ Redis             │
                    │ Sessions / Queue  │
                    └───────────────────┘

                    ┌───────────────────┐
                    │ KMS / HSM         │
                    │ Server secrets    │
                    └───────────────────┘

                    ┌───────────────────┐
                    │ Audit / SIEM      │
                    └───────────────────┘
```

---

## 3. Core Cryptographic Principles

### Zero-Knowledge Architecture
Never design the system where the backend handles raw user passwords to encrypt the database.
Instead, use **Client-side Encryption**:
```text
USER DEVICE (Master Password) -> KDF -> Encryption Key -> Client-side encryption -> Encrypted Vault -> HTTPS -> SERVER -> Database
```
The server should only see: `user_id`, `organization_id`, `ciphertext`, `encrypted keys`, metadata, timestamps, and audit information. The server must **never** see plaintext passwords.

### Separate Authentication from Encryption
* **Authentication**: Login Password -> Argon2id (RFC 9106) -> Password Verifier -> Server
* **Vault Encryption**: Master Password + Salt -> KDF -> Master Encryption Key -> Key Hierarchy -> Vault Encryption Key (AES-256-GCM / XChaCha20-Poly1305) -> Vault Data

### Key Hierarchy (Envelope Encryption)
```text
Master Password -> KDF -> Master Key (MK)
   |-> Key Encryption Key (KEK) -> Encrypted Vault Key -> Vault Key -> Items (Logins, Notes)
   |-> Authentication
```
Organizations share access via **Organization Master Key** -> Collection Key -> Items. Users access the Organization Key via their own Public/Private Key pairs.

---

## 4. Database Schema Guidelines
Do not create simplistic tables. Use a robust schema supporting metadata separation:
* `users`, `organizations`, `organization_members`, `groups`, `roles`, `permissions`
* `vaults`, `vault_members`, `collections`, `vault_items`, `vault_item_versions`
* `encrypted_keys`, `user_keys`, `organization_keys`
* `attachments`, `attachment_chunks`
* `sessions`, `refresh_tokens`, `passkeys`, `mfa_methods`, `recovery_codes`
* `audit_events`, `security_events`, `sharing_requests`, `emergency_access`, `access_requests`

**Crucial**: The actual secrets (username, password, TOTP secret, API key) live inside the `ciphertext` payload of `vault_items`, not as plaintext columns.

---

## 5. Enterprise Feature Set

### A. Personal & Team Vaults
Support Logins, Secure Notes, Credit Cards, Identities, SSH Keys, API Credentials, Certificates, and built-in TOTP.

### B. Organizations & Collections
Structure companies into Departments, Groups, Users, and Collections. Use Collections to share groups of credentials (e.g., "Production AWS") instead of individual passwords.

### C. Access Control
* **RBAC**: Define Roles (Super Admin, Security Admin, Read Only) -> Permissions -> Resources -> Actions.
* **ABAC**: Attribute-based access control (e.g., IF user in Engineering AND device trusted AND location=IN THEN allow).
* **Just-in-Time (JIT) Access**: Request access -> Manager Approval -> Granted for 30 minutes -> Auto-revoked.
* **Password Checkout**: Check out a credential with an automatic expiration timer.

### D. Identity & Provisioning
* **SSO**: Google Workspace, Entra ID, Okta, SAML 2.0, OIDC.
* **SCIM**: Automatic provisioning and deprovisioning of accounts based on HR systems.
* **MFA**: Require WebAuthn, Passkeys, FIDO2, and TOTP. Treat Passkeys as a first-class feature.
* **Session & Device Management**: Track active devices, IPs, and allow remote revocation.

### E. Audit & Compliance
* **Audit Logging**: Mandatory tracking of all logins, vault modifications, sharing, and policy changes. **Never log sensitive contents/passwords.**
* **Tamper-Resistant Logs**: Hash chain events (`H2 = SHA256(event2 + H1)`).
* **SIEM Integration**: Splunk, Microsoft Sentinel, Datadog via JSON/CEF/Syslog.
* **Compliance Targets**: SOC 2, ISO 27001, GDPR, HIPAA.

### F. Security Utilities
* Cryptographically secure Password Generator (`crypto.getRandomValues()`) with enterprise policies (length, symbols).
* Password Health Dashboard (detect weak, reused, or exposed credentials locally).
* Anti-phishing browser extension autofill with strict URL/origin matching.
* Offline mode (IndexedDB + local encryption) with robust conflict resolution.

---

## 6. Implementation & Build Order

**Phase 0 — Security Architecture**
* Threat model, Cryptographic design, Key hierarchy, Trust boundaries, Recovery design.

**Phase 1 — Crypto Prototype**
* Master key derivation, Vault key, Encryption/Decryption, Key wrapping, Rotation, Encrypted serialization.

**Phase 2 — Core Vault**
* Users, Vault, Items, Folders, Tags, Search, Trash, Versions, Attachments (encrypted before upload), Sync.

**Phase 3 — Authentication**
* Login, Logout, Sessions, Refresh tokens, MFA, WebAuthn, Passkeys, Recovery, Device management.

**Phase 4 — Enterprise**
* Organizations, Groups, RBAC, Collections, Policies, Sharing, Audit, SSO, SCIM, Admin console.

**Phase 5 — Browser Extension**
* Autofill, Password capture, Generator, Phishing protection, TOTP, Passkeys.

**Phase 6 — Secrets Management**
* API keys, SSH, Certificates, Secret rotation, Dynamic credentials, CLI, CI/CD integration.

---

## 7. Recommended Technology Stack

| Layer             | Recommendation                        |
| ----------------- | ------------------------------------- |
| **Web**           | Next.js + TypeScript                  |
| **UI**            | React + Tailwind                      |
| **Backend**       | Go or Rust                            |
| **Database**      | PostgreSQL                            |
| **Cache**         | Redis (Rate limiting, sessions)       |
| **Queue**         | Redis Streams / RabbitMQ              |
| **Storage**       | S3-compatible (Encrypted attachments) |
| **Crypto**        | Web Crypto + Audited native libraries |
| **KDF**           | Argon2id                              |
| **Encryption**    | AES-256-GCM or XChaCha20-Poly1305     |
| **Authentication**| OIDC + WebAuthn                       |
| **Enterprise SSO**| SAML + OIDC                           |
| **Provisioning**  | SCIM                                  |
| **Deployment**    | Docker / Kubernetes                   |
| **Secrets**       | KMS / HSM                             |

---

## 8. Next Steps / Action Items

Before writing any application code, produce the following **five design documents**:
1. `01-threat-model.md`
2. `02-cryptographic-architecture.md` (Including key hierarchy, salts, parameters)
3. `03-database-schema.md`
4. `04-api-specification.md`
5. `05-enterprise-feature-specification.md`
