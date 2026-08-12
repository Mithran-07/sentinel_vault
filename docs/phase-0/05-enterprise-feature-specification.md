# 05 — Enterprise Feature Specification

## 1. Overview
This document specifies all enterprise features beyond the personal vault core. It defines behaviour, data flows, UI requirements, and implementation constraints for each feature area. The zero-knowledge architecture must be maintained across all enterprise features, ensuring that the server never has access to plaintext secrets, keys, or passwords. This specification serves as the source of truth for engineering implementation of enterprise capabilities.

## 2. Organisation & Team Structure

### Organisation Hierarchy
The system uses a strict hierarchy to model enterprise boundaries:
- **Organisation:** The top-level tenant. It represents a single company or entity. All billing, SSO, and global policies apply at this level.
- **Departments (Optional):** Logical groupings within an Organisation (e.g., Engineering, HR).
- **Groups:** Security groupings used for access control and SCIM synchronization. Groups can contain Users.
- **Users:** Individual identities within the Organisation. A User can belong to one Organisation.

### Vault Types
- **Personal Vault:** A private storage area for a user. Only the user has the keys to decrypt these items. Can be disabled by Org policy.
- **Organisation Vault:** The overarching container for all company-owned data.
- **Shared Collection:** A subset of the Organisation Vault. A named grouping of items that can be shared among groups or individual users with specific permissions.

### Licensing Model
- **Seat-based:** Billed per active user (User Status = Active or Invited). Deactivated users do not consume a seat.
- **Grace Period:** When seat limits are exceeded (e.g., via SCIM automated provisioning), a 14-day grace period is initiated. The Billing Admin is notified. If unresolved, further creations are blocked, but existing users retain access.

### Organisation Creation Flow
1. **Initiation:** The founding user (future Owner) signs up and creates an Organisation.
2. **Key Generation:** The client generates an Organisation Key Pair (RSA-4096 or Ed25519) in the browser.
3. **Key Wrapping:** The Organisation Private Key is encrypted using the Owner's Public Key.
4. **Storage:** The encrypted Organisation Private Key and the plaintext Organisation Public Key are sent to the server. The server never sees the plaintext private key.

### Member Invitation Flow
1. **Invitation:** Admin invites a user via email. Server creates a placeholder record with status `Invited`.
2. **Acceptance:** User clicks the link, creates an account, and generates their User Key Pair. Their Public Key is published to the server.
3. **Key Delivery:** 
   - An Admin (who has the decrypted Organisation Private Key in memory) logs in.
   - The client polls for pending invitations.
   - The client fetches the newly registered user's Public Key.
   - The client encrypts the Organisation Private Key using the new user's Public Key.
   - The encrypted key is pushed to the server, completing the onboarding. The new user can now decrypt the Organisation Private Key when they log in.

## 3. Role-Based Access Control (RBAC)

### System Roles
| Role | Scope | Permissions |
|------|-------|-------------|
| **Owner** | Global | Complete control. Can delete the org, manage billing, change SSO, manage all users. Cannot be removed unless ownership is transferred. |
| **Super Admin** | Global | Can manage users, groups, policies, and collections. Cannot delete org or manage billing. |
| **Security Admin** | Global | Can configure SSO, SCIM, ABAC policies, MFA policies, and view audit logs. Cannot manage collections or vault items. |
| **Billing Admin** | Global | Manage payment methods, invoices, and subscriptions. No access to vault data or security settings. |
| **Collection Manager** | Collection | Can create collections, add/remove members from collections they manage, and modify items within. |
| **Org Member** | Personal | Default role. Can access assigned collections and their personal vault. |
| **Read-Only** | Personal | Can only view and copy items in assigned collections. Cannot create or edit items. |
| **Guest** | Collection | External contractors. Restricted to specific collections, usually time-bound. Cannot see the org directory. |

### Custom Roles
- **Creation:** Super Admins can create Custom Roles by combining granular permissions (e.g., `user.create`, `policy.read`, `audit.export`).
- **Assignment:** Roles are assigned to Users or Groups. A user inherits the union of all permissions granted by their roles.

## 4. Attribute-Based Access Control (ABAC)

### Policy Engine
The ABAC engine provides dynamic, context-aware access control evaluated at request time.

- **Policy Language:** JSON-based rules defining conditions and actions.
- **Evaluatable Attributes:**
  - `user.department`, `user.groups`, `user.role`
  - `device.trusted`, `device.os`
  - `location.country`, `location.ip`
  - `time.hour`, `time.dayOfWeek`
  - `request.action`, `request.resource`
- **Evaluation Order:** Policies are evaluated top-down. Explicit `DENY` always overrides `ALLOW`. Default is `DENY` if no policy matches.

### Example Policies
```json
{
  "id": "pol_123",
  "name": "Engineering Prod Access",
  "effect": "ALLOW",
  "conditions": {
    "AND": [
      {"attribute": "user.department", "operator": "EQUALS", "value": "Engineering"},
      {"attribute": "device.trusted", "operator": "EQUALS", "value": true},
      {"attribute": "request.resource.tags", "operator": "CONTAINS", "value": "prod"}
    ]
  }
}
```
```json
{
  "id": "pol_456",
  "name": "Geo-Fencing",
  "effect": "DENY",
  "conditions": {
    "AND": [
      {"attribute": "location.country", "operator": "NOT_IN", "value": ["US", "CA", "GB"]}
    ]
  }
}
```

### Storage and Versioning
Policies are stored in the database as JSON objects. Every change creates a new version. The active version is cached in Redis for fast evaluation.

## 5. Just-in-Time (JIT) Access

### Request Flow
1. **Request:** A user attempts to access a restricted Collection and clicks "Request Access". They provide a reason and duration.
2. **Notification:** The system sends a notification to the designated approver(s) via Slack webhook and Email.
3. **Approval:** The manager clicks "Approve" in the UI (or via Slack interactive button). 
4. **Cryptographic Grant:** The manager's client encrypts the Collection Key with the requester's Public Key and sends it to the server.
5. **Time-boxed Grant:** The server records the expiration time (configurable: 15min to 8hr).
6. **Auto-revoke:** A background worker removes the access record when the time expires. The Collection Key is rotated by the next authorized user who modifies the collection.

### Audit Trail
Every JIT request, approval, denial, and expiration generates an immutable audit event tagged with `category: jit_access`.

### Emergency Override
Security Admins can approve any JIT request instantly (Break-Glass procedure). This triggers high-priority alerts to all other admins.

### Notification Channels
- Email (SendGrid/SES)
- Slack / Microsoft Teams Webhooks
- PagerDuty incident creation (for high-severity collections)

## 6. Collections & Sharing

### Structure
A Collection is a named container for vault items. An item belongs to exactly one Collection.

### Cryptography
- **Collection Key:** A symmetric key (AES-256-GCM) is generated when the collection is created.
- **Item Encryption:** Each item in the collection is encrypted with the Collection Key.
- **Member Access:** The Collection Key is encrypted individually for each member using their Public Key.

### Adding a Member
1. Admin selects a user to add to the Collection.
2. Admin's client retrieves the user's Public Key.
3. Admin's client decrypts the Collection Key (already in memory).
4. Admin's client encrypts the Collection Key with the user's Public Key.
5. The encrypted Collection Key is pushed to the server.

### Removing a Member
Removing a member requires cryptographic rotation to ensure they cannot use a cached key.
1. Admin removes the user in the UI. Server drops the user's encrypted Collection Key.
2. **Key Rotation Requirement:** The Admin's client generates a *new* Collection Key.
3. The Admin's client re-encrypts all items in the collection with the new Collection Key. (This is done in batches by the client).
4. The Admin's client encrypts the new Collection Key for all *remaining* members.
5. The payload is sent to the server.
Note: Only users with `WRITE` or `MANAGE` permission can perform removal due to the re-encryption requirement.

### Permission Levels
- `READ`: Can view and copy item secrets.
- `WRITE`: Can add, edit, and delete items within the collection.
- `MANAGE`: Can add/remove members and change collection settings.

## 7. SSO & Identity Provider Integration

### 7a. SAML 2.0
- **Flows Supported:** SP-initiated and IdP-initiated.
- **Attribute Mapping:** configurable mapping for `email`, `displayName`, `firstName`, `lastName`, `groups`.
- **Just-in-Time Provisioning:** If a user logs in via SAML and doesn't exist, an account is created instantly (pending cryptographic key setup).
- **Certificate Management:** Org admins must upload the IdP X.509 certificate. The system alerts 30 days before expiration.

### 7b. OIDC / OAuth 2.0
- **Flow:** Authorization Code flow with PKCE (Proof Key for Code Exchange) strictly enforced.
- **Token Validation:** ID tokens are validated against the IdP's JWKS endpoint.
- **Group Claims:** `groups` claim mapped to internal Org Groups.

### 7c. Supported Providers
- Google Workspace
- Microsoft Entra ID (Azure AD)
- Okta
- OneLogin
- Generic SAML 2.0 / OIDC

## 8. SCIM 2.0 Provisioning

### Operations
- **User Create:** Provisions a user in `Invited` state.
- **User Update:** Updates name, department, title.
- **User Deactivate:** Changes status to `Deactivated`. Instantly terminates active sessions.
- **Group Sync:** Creates groups and manages memberships.

### SCIM Endpoint Paths
- `GET /scim/v2/Users`
- `POST /scim/v2/Users`
- `PUT/PATCH /scim/v2/Users/{id}`
- `GET /scim/v2/Groups`

### Deprovisioning Rules
When a user is deactivated via SCIM:
1. All active sessions are killed.
2. **Personal Vault:** Locked. The org can configure a policy: 
   - *Retain:* Data is kept for 30 days then deleted.
   - *Transfer:* If the org uses "Enterprise Key Escrow" (optional feature), the data is decrypted and transferred to the manager.
3. **Collections:** User loses access. Background job queues key rotation for collections they had access to.

## 9. Multi-Factor Authentication Policy

### Org-Level Enforcement
Security Admins can enforce MFA for all users. 
- **Grace Period:** Configurable (e.g., 7 days). Users can log in without MFA during this time but are prompted to set it up. After the grace period, login is blocked until MFA is registered.

### Supported Factors
1. **TOTP (Time-based One-Time Password):** Standard Authenticator apps.
2. **WebAuthn/FIDO2:** Hardware keys (YubiKey) and platform authenticators (TouchID, Windows Hello).
3. **Passkeys:** Can be used as a primary, passwordless authentication method (replacing the master password for authentication, though cryptographic keys are still derived/wrapped via a secure vault mechanism).

### Emergency Bypass
Admins can generate a temporary bypass code (valid for 24h) for users who lost their devices.

## 10. Device & Session Management

### Device Fingerprinting
Signals collected (hashed/anonymized where appropriate):
- Browser User Agent, OS, Screen Resolution
- IP Address, ASN, Geolocation (City/Country)
- Device ID (stored in localStorage)

### Trusted Devices
When a user logs in with MFA, they can "Trust this device for 30 days".
- Stored as a cryptographically signed JWT in an HttpOnly cookie.
- If the fingerprint changes significantly, trust is revoked.

### Session Management
- **Concurrent Limits:** Configurable max active sessions (default: 5).
- **Remote Revocation:** Users can view active sessions in Settings and revoke them. Revocation blacklists the JWT.
- **IP Allowlisting:** Org policy to restrict logins to specific CIDR blocks (e.g., corporate VPN).

## 11. Audit & Compliance

### Mandatory Events Logged
- User logins (success/failure)
- Collection creation/deletion
- Member added/removed from collection
- Item accessed, copied, revealed, modified, deleted
- Policy changes (RBAC/ABAC)
- JIT requests and approvals
- API Key generation

### Prohibited Log Contents
- Passwords, secrets, or sensitive notes
- Encryption keys (public or private)
- Ciphertext of vault items

### Log Retention & Export
- **Retention:** Minimum 1 year for enterprise tiers. Configurable up to 7 years.
- **Export Formats:** CSV, JSON, CEF.
- **Reporting:** Pre-built compliance reports (SOC 2, ISO 27001) summarizing access controls and administrative actions.

## 12. SIEM Integration

### Push Model (Webhooks)
Real-time event streaming to external SIEMs.
- **Splunk HEC:** Native format support.
- **Microsoft Sentinel:** Log Analytics workspace integration.
- **Datadog:** Log intake API.
- **Authentication:** All webhook payloads are HMAC-SHA256 signed using a secret generated in the vault UI.

### Pull Model
A dedicated Audit API (`GET /api/v1/audit/events`) allowing SIEMs to poll using a specific Audit API Key.

### Event Format Mapping
Internal JSON events are mapped to standard formats.
- **CEF:** `CEF:0|ZeroVault|Server|1.0|login_success|User Login|3|src=192.168.1.1 suser=user@org.com`

## 13. Browser Extension Specification

### Architecture
- **Service Worker (MV3):** Handles cryptography, API communication, and state management.
- **Content Script:** Injected into pages to detect login forms and perform autofill.
- **Popup:** React-based UI for manual searching and vault management.

### Autofill Rules
- **Anti-Phishing:** Exact domain matching required. Subdomain matching is configurable but defaults to strict. `example.com` will not autofill on `phishing-example.com`.
- **Credential Capture:** Detects `submit` events on forms with `<input type="password">`. Prompts user: "Save to Vault?"

### TOTP and Passkeys
- **TOTP:** Extension reads the encrypted TOTP URI, decrypts it in the Service Worker, computes the code, and autofills the 6-digit pin automatically.
- **Passkeys:** Extension registers as a FIDO2 credential provider using the Web Authentication API, allowing the vault to act as a passkey authenticator.

### Security
- **Memory:** Keys are kept in Service Worker memory.
- **Storage:** Ciphertext stored in IndexedDB. No plaintext ever touches disk.
- **Communication:** Secure Message Passing between content script and background worker.

## 14. Secrets Management (Phase 6)

### Secret Types
Supports machine-to-machine secrets:
- API Keys, DB Credentials, SSH Keys, TLS Certificates, Environment Variables (`.env`).

### Structure
Hierarchy for developers: `Project` -> `Environment` (Dev/Staging/Prod) -> `Secrets`.

### Versioning and Rotation
- Immutable versions. Every change creates a new version (`v1`, `v2`).
- Support for automated rotation via Webhooks or AWS Lambda integrations.

### Developer Tooling
- **CLI:** Native binary (Go/Rust). 
  `vault-cli get DB_PASSWORD --project backend --env production`
- **Integrations:** GitHub Actions, GitLab CI, Kubernetes Secrets Operator to inject secrets at runtime without exposing them to developers.

## 15. Deployment & Infrastructure

### Environments
- **Development:** Docker Compose (Node.js backend, React frontend, PostgreSQL, Redis).
- **Production:** Kubernetes (EKS/GKE) using Helm charts.

### Constraints & Standards
- **Stateless API:** Node.js/Go services must be completely stateless. All session data in Redis.
- **Secrets:** No secrets in Docker images. Injected via Kubernetes Secrets or AWS Secrets Manager.
- **Database:** PostgreSQL 15+. PgBouncer used for connection pooling.
- **TLS:** Terminated at the Ingress Controller (AWS ALB / Nginx). Internal traffic is unencrypted (or mTLS via Istio if required by compliance).
- **Backups:** Daily automated encrypted snapshots of PostgreSQL. 30-day retention. Multi-region replica for disaster recovery.

## 16. Compliance & Certification Roadmap

| Standard | Scope | Key Controls | Target |
|----------|-------|-------------|--------|
| **SOC 2 Type II** | Security, Availability, Confidentiality | 1. Logical access controls (RBAC/ABAC). 2. Audit logging of all access. 3. Data encryption at rest/transit. 4. Incident response plan. 5. Vendor risk management. | Q3 |
| **ISO 27001** | ISMS | 1. Information security policy. 2. Asset management (inventory). 3. Cryptographic controls policy. 4. Access control policy. 5. Physical security of data centers (AWS/GCP). | Q4 |
| **GDPR** | Data Privacy | 1. Right to erasure (Data deletion flows). 2. Data portability (Export functions). 3. Consent management. 4. DPA execution. 5. Privacy by design (Zero-knowledge architecture). | Q3 |
| **HIPAA** | ePHI Protection | 1. Access controls (Unique user IDs). 2. Audit controls (Hardware/software tracking). 3. Integrity controls (Ensure ePHI is not altered). 4. Transmission security (TLS 1.3). 5. BAA execution. | Q1 Next Year |
| **FedRAMP** | Gov Cloud | 1. FIPS 140-2 validated cryptography. 2. Continuous monitoring. 3. Multi-factor authentication (AAL3). 4. US-based data residency. 5. Incident reporting within 1 hr. | Future |

---
*End of Document. Approval required by Head of Engineering and CISO prior to Phase 1 implementation.*
