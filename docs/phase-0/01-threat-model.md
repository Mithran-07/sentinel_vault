# 01 — Threat Model

This document outlines the threat model for the Zero-Knowledge Enterprise Password Vault. It systematically identifies protected assets, potential attackers, trust boundaries, specific threats, and mitigation strategies to ensure a high-assurance security posture.

## 1. Protected Assets

The following assets are protected by the system. The compromise of these assets represents varying degrees of risk to the organisation and users.

| Asset | Classification | Owner | Location | Notes |
| :--- | :--- | :--- | :--- | :--- |
| Vault Item Ciphertext | Confidential | User / Org | PostgreSQL Database, Client Memory | Encrypted using AES-256-GCM. Server cannot read plaintext. |
| Master Encryption Key (MEK) | Highly Confidential | User | Client Memory (Ephemeral) | Derived from Master Password and KDF Salt. Never transmitted to the server. |
| Vault Encryption Key (VEK) | Highly Confidential | User | Client Memory, DB (Encrypted by MEK) | Symmetric key used to encrypt the vault items. Encrypted with the user's MEK for storage. |
| Auth Hash | Confidential | System | PostgreSQL Database | Cryptographic hash used for server-side authentication. Independent from MEK. |
| KDF Salt | Public | User | PostgreSQL Database | Used as input for Argon2id KDF on the client. |
| JWT Access Tokens | Confidential | System | Client Storage, DB (Revocation list) | Short-lived tokens for API access. |
| JWT Refresh Tokens | Highly Confidential | System | DB, Client Storage (HttpOnly Cookie) | Long-lived tokens for obtaining new Access Tokens. |
| Audit Log Chain | Internal | Org Admin | PostgreSQL Database | Immutable ledger of system events. Cryptographically chained. |
| Organisation Keys | Highly Confidential | Org | DB (Encrypted by Org Admins' keys) | Used for sharing vaults and items within an organisation. |
| User Private Keys | Highly Confidential | User | DB (Encrypted by MEK) | RSA/ECC keys for secure sharing and establishing trust. |
| Session Data | Confidential | System | Redis | Active connection metadata and state. |
| Attachment Ciphertext | Confidential | User / Org | S3 / Object Storage | Encrypted files attached to vault items. Server cannot read plaintext. |
| Admin Credentials | Highly Confidential | Super Admin | PostgreSQL Database | Credentials for system-wide configuration and management. |

## 2. Actors & Trust Levels

The system is designed with specific assumptions about the capabilities, motivations, and trust levels of various actors.

| Actor | Trust Level | Description | Risk Appetite |
| :--- | :--- | :--- | :--- |
| Authenticated User (Owner) | High | The legitimate owner of a personal vault or specific items. | N/A (Victim) |
| Authenticated User (Non-Owner) | Low | A legitimate user of the system attempting to access data they do not own. | Low - Medium (Curiosity, Insider Threat) |
| Organisation Admin | Medium | A user with privileges to manage organisation policies, users, and audit logs. Cannot decrypt users' private vaults. | Medium (Abuse of privilege, forced compliance) |
| Super Admin | Medium | System administrator managing the deployment infrastructure and database. | Medium - High (Insider threat, espionage) |
| Passive Network Attacker | None | Attacker eavesdropping on network traffic (e.g., public Wi-Fi). | Low |
| Active MitM Attacker | None | Attacker intercepting and modifying network traffic between client and server. | Medium |
| Malicious Server Operator | None | An insider with full control over the physical servers, database, and running processes. | High |
| Compromised 3rd-Party Dep. | None | Supply chain attack introducing malicious code into client or server components. | High (Targeted attack) |
| Nation-State Attacker | None | Highly resourced attacker capable of sophisticated, sustained attacks, potentially compelling server operators. | Very High |
| Unauthenticated External | None | Attacker with no credentials attempting to breach the system via the internet. | Medium - High |
| Automated Bot / Scraper | None | Scripts attempting credential stuffing, brute-forcing, or data scraping. | Low |

## 3. Trust Boundaries

Trust boundaries delineate areas where data moves from a trusted environment to a less trusted or untrusted environment. Security controls must be enforced at every boundary crossing.

```text
+-----------------------------------------------------------------------------------+
|                                 USER DEVICE (Untrusted)                           |
|                                                                                   |
|  +-----------------------------------------------------------------------------+  |
|  |                              BROWSER CONTEXT                                |  |
|  |                                                                             |  |
|  |  [ Web Application UI ] <---+                                               |  |
|  |                             | (A) Extension Isolation Boundary              |  |
|  |  [ Browser Extension ] <----+                                               |  |
|  |                                                                             |  |
|  +-----------------------------+-----------------------------------------------+  |
|                                | (B) TLS / Network Boundary                    |  |
+--------------------------------|--------------------------------------------------+
                                 v
+--------------------------------|--------------------------------------------------+
|                            API GATEWAY (Semi-trusted)                             |
|                                |                                                  |
|  +-----------------------------v-----------------------------------------------+  |
|  |                       Reverse Proxy / WAF                                   |  |
|  +-----------------------------+-----------------------------------------------+  |
|                                | (C) Internal Network Boundary                 |  |
+--------------------------------|--------------------------------------------------+
                                 v
+--------------------------------|--------------------------------------------------+
|                              SERVICES (Trusted)                                   |
|                                |                                                  |
|  +-------------+    +----------v----------+    +---------------+                  |
|  | Identity Svc|<---|     Vault API       |--->|   Admin API   |                  |
|  +-------------+    +----------+----------+    +---------------+                  |
|          |                     |                       |                          |
|          | (D) DB              | (E) Cache             | (F) Storage              |
|          v                     v                       v                          |
+----------|---------------------|-----------------------|--------------------------+
           |                     |                       |
+----------v----------+  +-------v-------+  +------------v-----------+
|    PostgreSQL       |  |     Redis     |  | S3 / Object Storage    |
|   (Data at Rest)    |  | (Session Data)|  | (Encrypted Attachments)|
+---------------------+  +---------------+  +------------------------+
           |
           | (G) Audit / SIEM Boundary
           v
+---------------------+
| SIEM / Audit Logs   |
| (Append-Only)       |
+---------------------+
```

### Boundary Descriptions:
*   **(A) User device ↔ Browser context:** The boundary between the OS and the isolated browser environment. The extension must be isolated from malicious web pages.
*   **(B) Browser context ↔ TLS channel:** Data leaving the browser must be encrypted via TLS 1.3 to prevent eavesdropping and tampering in transit.
*   **(C) TLS channel ↔ API Gateway:** The gateway terminates TLS, performs initial routing, and applies WAF rules.
*   **(D) Services ↔ PostgreSQL:** Internal connection to the primary datastore. Requires mutual authentication and access control.
*   **(E) Services ↔ Redis:** Internal connection to the session and caching layer.
*   **(F) Services ↔ S3/Object Storage:** Boundary for storing large encrypted blobs. Must enforce strict access policies (signed URLs).
*   **(G) Server ↔ SIEM/Audit pipeline:** One-way boundary for shipping logs to an immutable audit system.

## 4. STRIDE Threat Analysis

This section analyzes threats categorized by the STRIDE methodology.

| Threat | Component | Attack Vector | Impact | Mitigation | Residual Risk |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Spoofing** | API Gateway | Attacker replays a captured, valid JWT to spoof an authenticated user. | Unauthorised API access. | Enforce short JWT expiries (e.g., 15 mins). Bind tokens to client IP/Fingerprint (optional). Require HTTPS. | Low |
| **Spoofing** | Frontend / Ext. | Phishing site mimics the vault login page to capture the Master Password. | Total vault compromise. | Browser extension warns on unrecognised domains. Support WebAuthn (FIDO2) which is origin-bound. | Medium |
| **Spoofing** | Identity Svc | Attacker forges a JWT by exploiting a weak signing secret or "none" algorithm. | Complete system bypass. | Use robust secrets (managed via KMS), enforce asymmetric signing (RS256), strictly validate algorithm headers. | Low |
| **Tampering** | PostgreSQL | Malicious server operator modifies encrypted vault items to corrupt data. | Data loss or denial of service. | Vault items use AES-GCM (AEAD). Client verifies authentication tags upon decryption. Fails securely if tampered. | Low |
| **Tampering** | API Gateway | MitM attacker modifies API requests/responses in transit. | Unauthorised actions, data corruption. | Enforce HSTS, TLS 1.3 only, certificate pinning in mobile apps. | Low |
| **Tampering** | S3 Storage | Attacker replaces encrypted attachments in S3 with malicious files. | Client executes malicious file upon download. | Attachment metadata (including SHA-256 hash) is stored encrypted in DB. Client verifies hash after decryption. | Low |
| **Repudiation** | PostgreSQL | Rogue admin deletes audit logs to hide unauthorized access attempts. | Loss of forensic capability. | Cryptographic hash chaining of audit logs. Ship logs to a separate, append-only SIEM. | Low |
| **Repudiation** | Vault API | User performs a destructive action (e.g., deleting a shared folder) and denies it. | Operational confusion, lack of accountability. | Comprehensive, cryptographically signed audit logging of all write actions by the client. | Low |
| **Info. Disclosure** | PostgreSQL | SQL Injection vulnerability allows extraction of the entire database. | Exposure of KDF salts, Auth Hashes, and Ciphertexts. | Use parameterized queries (ORMs like Prisma/TypeORM). However, ZK architecture ensures plaintext is not exposed even if DB is dumped. | Very Low |
| **Info. Disclosure** | Client Memory | Malware on user's device dumps process memory to extract the MEK. | Total vault compromise. | Zeroise sensitive keys in memory when not in use. Beyond the threat model (client device compromise). | High |
| **Info. Disclosure** | Express API | Detailed error messages or stack traces leak internal infrastructure details. | Aids attacker reconnaissance. | Standardised API error responses. Log full errors internally, return generic 500s to clients. | Low |
| **Denial of Service** | KDF / Auth | Attacker spams login endpoints, exhausting server CPU due to KDF (if any server-side hashing is used). | System unavailability. | KDF is primarily client-side (Argon2id). Server performs fast verification (e.g., bcrypt/Argon2-verify). Implement strict rate limiting and CAPTCHA. | Medium |
| **Denial of Service** | API Gateway | Distributed Denial of Service (DDoS) attack on the API endpoints. | System unavailability. | Deploy behind a CDN/WAF (e.g., Cloudflare, AWS Shield) with DDoS protection capabilities. | Medium |
| **Elevation of Priv.** | Vault API | IDOR (Insecure Direct Object Reference) allows user A to fetch user B's encrypted vault item. | Exposure of ciphertext (not plaintext, due to ZK). | Strict authorization checks on every endpoint ensuring the requester is the owner or authorized sharing recipient. | Low |
| **Elevation of Priv.** | Admin API | Unauthenticated user accesses administrative endpoints to grant themselves privileges. | Complete system takeover. | Admin API must be isolated (e.g., separate network, VPN required) and require strong MFA. | Low |

## 5. Attack Vectors — Detailed

### 5.1 Master Password Brute Force (Online)
*   **Vector:** Attacker repeatedly attempts to guess a user's Master Password via the login API.
*   **Precondition:** Attacker knows the user's email address.
*   **Steps:** 1. Attacker sends requests with guessed passwords. 2. Client derives Auth Hash. 3. Server verifies Auth Hash.
*   **Impact:** If successful, attacker gains full access to the vault.
*   **Detection:** High volume of failed login attempts from a single IP or across IPs for a single account.
*   **Mitigation:** Strict rate limiting per IP and per account. Account lockout after N failed attempts. CAPTCHA integration. Recommend complex passwords.

### 5.2 Master Password Brute Force (Offline, Stolen DB)
*   **Vector:** Attacker breaches the server, steals the database, and attempts to crack the Auth Hashes offline.
*   **Precondition:** Full database compromise.
*   **Steps:** 1. Attacker extracts Auth Hash and KDF Salt. 2. Attacker runs massive parallel cracking rigs using Argon2id.
*   **Impact:** If successful, attacker can derive the MEK and decrypt the user's vault ciphertext offline.
*   **Detection:** Intrusion detection on the database layer. Impossible to detect offline cracking once data is exfiltrated.
*   **Mitigation:** Client-side KDF using Argon2id with high work factors (memory and iterations) tuned to make offline cracking economically unfeasible for all but the weakest passwords.

### 5.3 JWT Theft via XSS
*   **Vector:** Cross-Site Scripting (XSS) vulnerability in the Next.js frontend allows an attacker to execute arbitrary JavaScript.
*   **Precondition:** Flaw in input sanitization or vulnerable dependency.
*   **Steps:** 1. Attacker injects malicious script. 2. Script reads JWT from `localStorage` or `sessionStorage`. 3. Script exfiltrates JWT to attacker's server.
*   **Impact:** Attacker can impersonate the user and access the API until the token expires. Note: Attacker still needs the MEK to decrypt data, but could delete encrypted data or download it.
*   **Detection:** Content Security Policy (CSP) violation reports. WAF detecting XSS payloads.
*   **Mitigation:** Store Refresh Tokens in `HttpOnly` cookies. Store Access Tokens securely (memory preferred, or tightly scoped workers). Implement strict CSP. Sanitize all React renders.

### 5.4 Malicious Server Operator Extracting Vault Data
*   **Vector:** A rogue sysadmin with root access to the database attempts to read user passwords.
*   **Precondition:** Insider threat.
*   **Steps:** 1. Admin queries the PostgreSQL database for vault items.
*   **Impact:** None regarding plaintext confidentiality. The operator only sees AES-256-GCM ciphertext. They cannot derive the MEK.
*   **Detection:** Audit logging of administrative database queries.
*   **Mitigation:** The Zero-Knowledge architecture inherently mitigates this. Data is encrypted client-side. The server never possesses the keys.

### 5.5 Supply-Chain Attack (Compromised npm package)
*   **Vector:** A malicious update to a widely used npm dependency (e.g., a crypto library or React component) is pushed.
*   **Precondition:** Attacker compromises the package maintainer's account.
*   **Steps:** 1. Malicious code is installed during build. 2. Code exfiltrates the Master Password or MEK directly from the client's memory before encryption.
*   **Impact:** Total vault compromise, bypassing Zero-Knowledge protections.
*   **Detection:** Dependency scanning, Software Bill of Materials (SBOM) monitoring, runtime anomaly detection.
*   **Mitigation:** Pin dependency versions. Use Subresource Integrity (SRI). Conduct regular security audits of dependencies. Limit third-party code in the critical path (crypto operations).

### 5.6 Browser Extension Phishing (Fake Extension)
*   **Vector:** Attacker publishes a malicious browser extension that mimics the official vault extension.
*   **Precondition:** User is tricked into installing the fake extension.
*   **Steps:** 1. User enters Master Password into the fake extension. 2. Extension sends credentials to attacker.
*   **Impact:** Total vault compromise.
*   **Detection:** Brand monitoring on extension stores.
*   **Mitigation:** Clear communication to users on how to identify the official extension. Request verification/badges from browser vendors (Google, Mozilla).

### 5.7 Autofill Credential Harvesting on Phishing Site
*   **Vector:** A malicious website contains hidden login forms designed to trick the password manager's autofill feature.
*   **Precondition:** User visits a malicious site while the extension is active.
*   **Steps:** 1. Extension detects forms and autofills credentials. 2. Site captures the autofilled data via JavaScript.
*   **Impact:** Compromise of specific credentials stored in the vault, not the vault itself.
*   **Detection:** Heuristics within the extension to detect invisible or suspicious forms.
*   **Mitigation:** Require explicit user interaction (e.g., clicking a button or hotkey) to autofill. Implement strict origin matching (never autofill on different domains).

### 5.8 Insider Threat — Rogue Admin Queries DB Directly
*   **Vector:** Database admin modifies data directly, bypassing the API and application-level audit logs.
*   **Precondition:** DBA access.
*   **Steps:** 1. Admin connects to PostgreSQL. 2. Admin deletes or corrupts ciphertext.
*   **Impact:** Data loss or Denial of Service for specific users.
*   **Detection:** Database-level auditing (e.g., pgAudit) sending logs to an external, immutable SIEM.
*   **Mitigation:** Client-side authenticated encryption (GCM) ensures the client detects tampering. Regular database backups to restore deleted data.

### 5.9 Session Fixation / Refresh Token Theft
*   **Vector:** Attacker steals a long-lived Refresh Token (e.g., via physical access or malware) and uses it to generate new Access Tokens.
*   **Precondition:** Attacker gains access to the client device or its storage.
*   **Steps:** 1. Attacker copies the HttpOnly cookie or local storage. 2. Attacker replays it from their machine.
*   **Impact:** Persistent unauthorised API access.
*   **Detection:** Anomaly detection (e.g., Refresh Token used from a new IP/country).
*   **Mitigation:** Implement Refresh Token Rotation (issue a new token on every use, invalidate the family if an old token is reused). Bind sessions to device fingerprints.

### 5.10 TOTP/MFA Bypass via Social Engineering
*   **Vector:** Attacker calls IT support pretending to be the user, claiming they lost their phone, and requests an MFA reset.
*   **Precondition:** Attacker knows the Master Password (or the system uses server-side recovery).
*   **Steps:** 1. Support agent disables MFA. 2. Attacker logs in.
*   **Impact:** Bypassing the second factor of authentication.
*   **Detection:** Audit logs showing MFA reset actions.
*   **Mitigation:** Strict verification protocols for support staff. Disallow support from disabling MFA without cryptographically verified identity (e.g., recovery codes generated at setup).

### 5.11 Audit Log Tampering (Hash Chain Attack)
*   **Vector:** Attacker compromises the server and attempts to alter historical audit logs to hide their tracks, recalculating the hash chain.
*   **Precondition:** Full server compromise.
*   **Steps:** 1. Attacker modifies log entry N. 2. Attacker recalculates hashes for N, N+1, N+2...
*   **Impact:** Loss of trust in the audit trail.
*   **Detection:** SIEM alerts on inconsistencies or retroactive changes.
*   **Mitigation:** Continuously stream audit logs to an external, write-once-read-many (WORM) storage system (e.g., AWS S3 Object Lock) immediately upon creation.

### 5.12 Mass Account Enumeration
*   **Vector:** Attacker queries the registration or login endpoints to determine which email addresses have accounts.
*   **Precondition:** Exposed API endpoints.
*   **Steps:** 1. Attacker submits a list of emails. 2. API responds differently for existing vs. non-existing accounts (e.g., different error messages, timing differences).
*   **Impact:** Privacy violation, aids in targeted phishing attacks.
*   **Detection:** High volume of requests to identity endpoints.
*   **Mitigation:** Return identical, generic responses for both valid and invalid accounts during login/recovery (e.g., "If the account exists, an email has been sent"). Ensure constant-time string comparisons and KDF execution times regardless of account existence.

## 6. Zero-Knowledge Guarantees

The core tenet of this architecture is Zero-Knowledge (ZK). The server infrastructure must be fundamentally incapable of accessing user plaintext data.

### 6.1 Server Stores (Database & Storage)
The server explicitly stores the following, and *only* the following, related to user data:
*   `user_id` (UUID)
*   `email` (Encrypted or hashed if privacy requires, otherwise plaintext for routing)
*   `kdf_salt` (Randomly generated per user)
*   `kdf_iterations`, `kdf_memory`, `kdf_parallelism` (Argon2id parameters)
*   `auth_hash` (Derived for server-side verification)
*   `vault_items.ciphertext` (AES-256-GCM encrypted data blob)
*   `vault_items.iv` (Initialization Vector)
*   `vault_items.mac` (Authentication Tag)
*   `public_keys` (For asymmetric sharing)
*   `encrypted_private_keys` (Encrypted with the user's MEK)

### 6.2 Server Never Sees
The server must **never** process, receive, or store in memory or disk:
*   The user's Master Password (in plaintext).
*   The Master Encryption Key (MEK) derived on the client.
*   The Vault Encryption Key (VEK) (in plaintext).
*   The plaintext contents of any vault item (passwords, notes, URIs).
*   The plaintext contents of any attached file.

### 6.3 Scenario: Full Database Compromise
If an attacker obtains a complete dump of the PostgreSQL database:
*   They obtain all ciphertexts and Auth Hashes.
*   They **cannot** decrypt any vault items without performing an offline brute-force attack against the Argon2id protected Master Password to derive the MEK.
*   Assuming a strong Master Password, the data remains cryptographically secure.

### 6.4 Scenario: Full Server Process Compromise
If an attacker achieves Remote Code Execution (RCE) on the Node.js/Express API servers:
*   They can capture all data in transit (which is already encrypted by the client).
*   They can modify the API responses to serve malicious JavaScript to web clients (breaking the ZK guarantee for web users, see Mitigation 5.5).
*   They **cannot** instantly decrypt existing stored data.
*   *Note:* Desktop and mobile applications with pinned certificates and signed binaries are immune to the malicious JavaScript injection vector.

### 6.5 Malicious Server Operator Capabilities
*   **Can:** Delete user data (DoS), monitor connection metadata (IPs, access times), attempt to serve malicious client code (mitigated by native apps/extensions).
*   **Cannot:** Decrypt vault items, read passwords, forge digital signatures of users.

## 7. Security Assumptions & Dependencies

The validity of this threat model relies on several critical assumptions. If any of these are invalidated, the security posture is compromised.

1.  **Browser WebCrypto API Integrity:** We assume the underlying operating system and browser correctly and securely implement the Web Crypto API (e.g., `crypto.subtle`), and that the Random Number Generator (CSPRNG) is not predictable.
2.  **TLS Validity:** We assume TLS 1.3 provides secure, authenticated encryption in transit and that the PKI infrastructure (Certificate Authorities) is not compromised.
3.  **Client Device Integrity:** We assume the user's device (laptop, phone) is not compromised by malware (e.g., keyloggers, memory scrapers). *A compromised client device means game over for that user's data.*
4.  **Cryptographic Primitives:** We assume AES-256-GCM and Argon2id are mathematically sound and have no known practical cryptographic breaks.
5.  **Implementation Correctness:** We assume the client-side cryptographic implementation correctly handles IVs (never reusing them) and properly verifies GCM authentication tags.
6.  **Time Synchronisation:** We assume the server's clock is accurately synchronised via NTP to allow for correct validation of JWT expiries and TOTP tokens.
7.  **Physical Security:** We assume the physical data centers hosting the infrastructure (e.g., AWS, GCP) are secure against physical intrusion.

## 8. Out of Scope

The following threats and vectors are explicitly **out of scope** for this specific threat model document:

*   **Physical Theft of User Devices:** If a user's unlocked laptop is stolen while the vault is decrypted in memory, this is beyond the application's control (though short auto-lock timeouts mitigate this).
*   **Social Engineering of End Users:** Phishing attacks that successfully trick users into handing over their Master Password to a third-party site (though mitigation strategies like FIDO2 are recommended, the human element is out of scope for the architectural model).
*   **Cryptanalysis of AES/Argon2:** We assume standard, vetted cryptographic algorithms are secure. We are not modelling theoretical breaks in AES-256.
*   **Detailed Network Infrastructure Attacks:** E.g., BGP hijacking, DNS spoofing at the ISP level (these are mitigated by TLS, but the underlying network attacks are out of scope).
*   **Third-Party Identity Provider Compromise:** If an organisation uses SAML/OIDC and their IdP (e.g., Okta, Azure AD) is totally compromised, the attacker can access the system as those users. We trust the configured IdP.

## 9. Mitigations Summary Table

| Threat ID | Threat Description | Control Type | Control Description | Priority |
| :--- | :--- | :--- | :--- | :--- |
| TR-001 | Offline Brute Force of Master Password | Preventative | Client-side Argon2id KDF with high work factor. | Critical |
| TR-002 | Server Operator Data Exfiltration | Preventative | Client-side AES-256-GCM encryption (Zero-Knowledge). | Critical |
| TR-003 | XSS leading to Token Theft | Preventative | Strict CSP, React auto-escaping, HttpOnly cookies for Refresh Tokens. | High |
| TR-004 | Session Fixation / Replay | Preventative | Refresh Token Rotation, short-lived Access Tokens. | High |
| TR-005 | Supply Chain Attack (Client) | Preventative/Detective| Dependency pinning, SRI, SBOM, regular auditing. | High |
| TR-006 | Malicious Server JS Injection | Preventative | Promote use of Native Apps / Browser Extensions over Web Vault. | Medium |
| TR-007 | Database Tampering / Deletion | Detective/Recovery | GCM Auth Tags, Immutable Audit Logs, Point-in-Time DB Backups. | High |
| TR-008 | Online Brute Force / Cred Stuffing | Preventative | Rate limiting, CAPTCHA, Account Lockout policies. | Medium |
| TR-009 | IDOR on Vault API | Preventative | Strict authorization middleware checking ownership/access rights. | Critical |
| TR-010 | Unauthorised Admin Access | Preventative | Network isolation (VPN), strong MFA, Role-Based Access Control. | High |

## 10. Review & Sign-off

| Role | Name | Date | Status | Next Review Date |
| :--- | :--- | :--- | :--- | :--- |
| Security Architect | [Pending] | [YYYY-MM-DD] | Draft | [YYYY-MM-DD] |
| Lead Developer | [Pending] | [YYYY-MM-DD] | Draft | [YYYY-MM-DD] |
| Product Owner | [Pending] | [YYYY-MM-DD] | Draft | [YYYY-MM-DD] |

---
*End of Document*
