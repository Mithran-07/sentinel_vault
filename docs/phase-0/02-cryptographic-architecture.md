# 02 — Cryptographic Architecture

## 1. Design Principles

The zero-knowledge password vault is designed around a core philosophy that the server infrastructure must be utterly blind to the plaintext content it stores and processes. This philosophy is manifested through the following design principles:

- **Zero-Knowledge Guarantee Definition**: The server possesses absolutely zero cryptographic material necessary to decrypt any user vault item. Compromise of the entire server database, memory, and disk yields only encrypted ciphertext. The encryption keys never leave the user's device in an unencrypted state. The system is designed such that a rogue database administrator, a subpoena, or a total server compromise cannot reveal user data.
- **Separation of Authentication from Encryption**: The system strictly isolates the cryptographic primitive used to prove identity to the server (authentication) from the primitive used to decrypt the vault (encryption). A compromise of the authentication mechanism does not compromise the encryption mechanism.
- **Envelope Encryption Model**: Cryptographic operations follow an envelope encryption model. Data is encrypted with a Data Encryption Key (DEK), and the DEK itself is encrypted with a Key Encryption Key (KEK). This allows efficient key rotation (rotating the KEK without re-encrypting all data) and enables organizational key sharing patterns.
- **Forward Secrecy Considerations**: While true Perfect Forward Secrecy (PFS) is complex in offline-capable storage systems, the architecture utilizes short-lived session tokens for transport and API authentication, ensuring that captured past network traffic cannot be decrypted or utilized if long-term credentials are later compromised.
- **Cryptographic Agility (Future Algorithm Migration)**: The architecture embeds algorithm identifiers (e.g., version tags and cipher suites) alongside all ciphertexts and hashes. This ensures seamless future migrations from current primitives (e.g., AES-256-GCM, Argon2id) to next-generation or post-quantum algorithms without breaking backwards compatibility.

---

## 2. Key Hierarchy

The cryptographic foundation relies on a strict key derivation and encapsulation tree. All encryption keys are derived from the user's master password combined with high-entropy salts.

```text
Master Password + KDF Salt
  │
  └─ Argon2id ──> Master Encryption Key (MEK) [256-bit]
        │
        ├─> HMAC-SHA256 (Purpose: "Auth") ──> Auth Hash [256-bit, sent to server for login]
        │
        └─> HMAC-SHA256 (Purpose: "KEK") ──> Key Encryption Key (KEK) [256-bit]
              │
              └─> Decrypt (AES-256-GCM) ──> Vault Encryption Key (VEK) [256-bit, stored encrypted on server]
                    │
                    └─> AES-256-GCM ──> Vault Item Ciphertext

Organisation Key Flow:
User X25519 Private Key (encrypted under VEK)
  │
  └─> Decrypt (AES-256-GCM) ──> User Private Key [256-bit]
        │
        └─> X25519+HKDF-SHA256 (with Org Public Key) ──> Org Key Decryption Key
              │
              └─> Decrypt (AES-256-GCM) ──> Org Master Key [256-bit]
                    │
                    └─> Decrypt (AES-256-GCM) ──> Collection Keys [256-bit]
                          │
                          └─> AES-256-GCM ──> Shared Items
```

### Key Specifications

#### Master Encryption Key (MEK)
- **Algorithm**: Argon2id
- **Length**: 256 bits
- **Where derived**: Client device (browser memory / app memory)
- **Where stored**: Ephemeral device memory only. Never stored persistently.
- **Lifetime**: Duration of the active user session.
- **Rotation trigger**: Master password change.

#### Auth Hash
- **Algorithm**: HMAC-SHA256
- **Length**: 256 bits
- **Where derived**: Client device.
- **Where stored**: Server database (hashed again using bcrypt/Argon2 before storage).
- **Lifetime**: Until master password change.
- **Rotation trigger**: Master password change.

#### Key Encryption Key (KEK)
- **Algorithm**: HMAC-SHA256
- **Length**: 256 bits
- **Where derived**: Client device.
- **Where stored**: Ephemeral device memory only.
- **Lifetime**: Duration of the active user session.
- **Rotation trigger**: Master password change.

#### Vault Encryption Key (VEK)
- **Algorithm**: AES-256-GCM
- **Length**: 256 bits
- **Where generated**: Client device (CSPRNG upon account creation).
- **Where stored**: Server database (Encrypted under KEK).
- **Lifetime**: Until vault reset or explicit key rotation.
- **Rotation trigger**: Security breach suspicion, periodic organizational policy (e.g., every 365 days).

#### User X25519 Private Key
- **Algorithm**: X25519
- **Length**: 256 bits
- **Where generated**: Client device (CSPRNG upon account creation).
- **Where stored**: Server database (Encrypted under VEK).
- **Lifetime**: Until vault reset.
- **Rotation trigger**: Security breach suspicion.

#### Org Master Key
- **Algorithm**: AES-256-GCM
- **Length**: 256 bits
- **Where generated**: Client device of the organization creator.
- **Where stored**: Server database (Encrypted under multiple users' Public Keys via HPKE).
- **Lifetime**: Until organization dissolution or explicit rotation.
- **Rotation trigger**: Administrator departure, periodic compliance requirement.

#### Collection Key
- **Algorithm**: AES-256-GCM
- **Length**: 256 bits
- **Where generated**: Client device of the collection creator.
- **Where stored**: Server database (Encrypted under Org Master Key or direct user keys).
- **Lifetime**: Until collection deletion or explicit rotation.
- **Rotation trigger**: User removal from collection.

---

## 3. KDF Specification

To thwart brute-force and dictionary attacks, the architecture utilizes Argon2id, the winner of the Password Hashing Competition (PHC) and recommended by RFC 9106.

### Argon2id Parameters

- **Memory cost (m)**: `65536` (64 MiB) — Minimum acceptable: `32768` (32 MiB).
- **Time cost (t)**: `3` iterations — Minimum acceptable: `2` iterations.
- **Parallelism (p)**: `4` lanes.
- **Output length**: `32` bytes (256 bits).
- **Salt Length**: `32` bytes.
- **Salt Generation**: Client-side `crypto.getRandomValues()` during registration.
- **Salt Storage**: Stored in plaintext on the server, requested by the client during the initial login step.
- **Uniqueness**: Globally unique per user. Enforced by 32 bytes of CSPRNG entropy.

### Rationale vs OWASP/RFC 9106
RFC 9106 recommends `m=65536, t=3, p=4` for environments where 64 MiB of memory is acceptable (which is true for modern browsers and mobile devices). These parameters provide strong resistance against GPU and ASIC cracking while maintaining a sub-500ms derivation time on average consumer hardware, ensuring a smooth user experience. 

### Parameter Versioning
The KDF configuration is versioned in the database. The client requests the user's salt and KDF parameters before derivation.
JSON payload from server:
```json
{
  "kdfAlgorithm": "argon2id",
  "kdfIterations": 3,
  "kdfMemory": 65536,
  "kdfParallelism": 4,
  "salt": "base64_encoded_salt..."
}
```
If a user logs in with older parameters, the client derives the key, authenticates, and silently re-encrypts/re-hashes with upgraded parameters, pushing the update back to the server.

### Auth-Path vs Encryption-Path KDF
The system derives a single `Master Encryption Key (MEK)` using the expensive Argon2id operation. 
To separate authentication from encryption without requiring two expensive Argon2id computations, the MEK is passed through a computationally cheap HKDF/HMAC step:
- **Auth Hash** = `HMAC-SHA256(Key: MEK, Message: "AuthHash_v1")`
- **KEK** = `HMAC-SHA256(Key: MEK, Message: "VaultKey_v1")`
This ensures the Auth Hash sent to the server cannot be reversed to find the MEK or KEK.

---

## 4. Symmetric Encryption Specification

The primary symmetric encryption algorithm for vault items is **AES-256-GCM**.

### AES-256-GCM Parameters
- **Nonce/IV Length**: `12` bytes (96 bits) — Recommended by NIST SP 800-38D.
- **Nonce Generation**: Client-side `crypto.getRandomValues()`.
- **Uniqueness**: Must be unique per encryption operation.
- **Nonce Reuse Implications**: In AES-GCM, reusing a nonce with the same key catastrophically compromises the authentication key and allows forging ciphertexts. It can also leak the XOR difference of the plaintexts. Therefore, random 96-bit nonces are strictly enforced.
- **Authentication Tag Length**: `16` bytes (128 bits).
- **Additional Authenticated Data (AAD)**: Contains the `Item ID` and `User ID`. This binds the ciphertext to its logical location in the database, preventing a malicious server from swapping ciphertexts between different items or users.
- **Key Commitment**: AES-GCM **does not** provide key commitment (a single ciphertext might decrypt successfully with two different keys). For a password manager, the primary risk of non-key-committing AEAD is theoretical in this context, but future migrations will address this.
- **Maximum Data Per Key**: NIST dictates a maximum of 2^32 invocations for a single key. The system enforces key rotation well before 2^30 encryptions.

### Ciphertext Format Serialization
Encrypted data is serialized into a standard layout before storage:
`[Version: 1 byte] || [IV: 12 bytes] || [Ciphertext: N bytes] || [Tag: 16 bytes]`

The entire buffer is base64 encoded for JSON transmission:
```javascript
const encryptedPayload = btoa(String.fromCharCode(...new Uint8Array(buffer)));
```

### Future Migration: XChaCha20-Poly1305
While AES-256-GCM benefits from hardware acceleration (AES-NI), XChaCha20-Poly1305 is targeted for future migration due to its 192-bit nonce. A 192-bit nonce allows random generation without the theoretical risk of collision present in 96-bit nonces, making it safer for distributed systems generating billions of ciphertexts. XChaCha20 is also exceptionally fast in software on mobile devices lacking hardware AES acceleration.

---

## 5. Asymmetric Cryptography (Organisation Key Sharing)

To facilitate secure sharing of items and collections within an organization without revealing keys to the server, the architecture utilizes asymmetric cryptography.

### Specifications
- **Algorithm**: **X25519 (ECDH)** combined with **HKDF-SHA256** and **AES-256-GCM**.
- **Rationale**: X25519 is preferred over RSA-OAEP due to significantly smaller key sizes, faster generation and computation, and immunity to padding oracle attacks. 

### Key Generation & Storage
- **Key Generation**: Generated on the client device via `crypto.subtle.generateKey({ name: "X25519" })` during user onboarding.
- **Public Key**: Stored in plaintext on the server. The trust model is TOFU (Trust On First Use), supplemented by out-of-band fingerprint verification (similar to Signal or WhatsApp) for high-security environments.
- **Private Key**: Encrypted under the user's symmetric Vault Encryption Key (VEK) using AES-256-GCM. Stored in the server database as ciphertext.

### Key Exchange Flow (Sharing a Collection)
When Alice (Admin) shares a "Marketing Collection" with Bob (New User):
1. Alice's client downloads Bob's X25519 Public Key from the server.
2. Alice's client retrieves the plaintext `Collection Key` (already in Alice's memory).
3. Alice's client performs ECDH using Alice's X25519 Private Key and Bob's Public Key to generate a Shared Secret.
4. Alice's client passes the Shared Secret through HKDF-SHA256 to derive a Key Encryption Key (KEK).
5. Alice's client encrypts the `Collection Key` using AES-256-GCM with the derived KEK.
6. The resulting ciphertext is uploaded to the server and mapped to Bob's user ID.
7. Bob downloads the ciphertext, performs the inverse ECDH with his Private Key and Alice's Public Key, derives the KEK, and decrypts the `Collection Key`.

### Key Revocation Flow
When Bob is removed from the "Marketing Collection":
1. The server deletes Bob's encrypted copy of the `Collection Key`. (Note: The server is untrusted, so this is an administrative step, not a cryptographic guarantee).
2. Alice's client generates a brand new `Collection Key` via CSPRNG.
3. Alice's client downloads all vault items in the "Marketing Collection", decrypts them with the old key, and re-encrypts them with the new key.
4. Alice's client encrypts the new `Collection Key` for all remaining authorized users (excluding Bob) using their public keys.
5. Alice uploads the new item ciphertexts and the new encrypted Collection Keys to the server. Bob now possesses only an old key which is useless for newly encrypted items or modifications.

---

## 6. Authentication Tokens

The application uses JSON Web Tokens (JWT) for stateless, scalable API authentication.

### JWT Algorithm
- **MVP Choice**: **HS256** (HMAC with SHA-256). The MVP uses a single monolithic backend, making symmetric signing efficient and easy to implement. The 256-bit signing key is generated via CSPRNG and stored securely in server environment variables.
- **Future Migration**: **RS256** or **ES256**. As the architecture scales to microservices, asymmetric signing allows resource servers to verify tokens using a public key without needing access to the private signing key, adhering to the principle of least privilege.

### Access Token Specification
- **Payload**:
  ```json
  {
    "sub": "user_uuid_12345",
    "orgId": "org_uuid_67890",
    "role": "admin",
    "jti": "unique_token_id",
    "iat": 1691848000,
    "exp": 1691848900
  }
  ```
- **Expiry**: `15` minutes (900 seconds).

### Refresh Token Specification
- **Payload**: Contains a unique database reference ID rather than encoded claims.
- **Expiry**: `30` days.
- **Rotation Policy**: Absolute expiration. Upon every access token refresh, a new refresh token is issued, and the old one is invalidated.
- **Family-based Invalidation**: If a utilized (old) refresh token is presented again, the server assumes token theft. The entire token family (all tokens originating from that login session) is immediately revoked, forcing the user to re-authenticate with their master password.

### Token Storage (Client-Side)
- **Access Token**: Stored in ephemeral application memory (e.g., React state/Redux). It is NEVER stored in `localStorage` or `sessionStorage` to prevent exfiltration via Cross-Site Scripting (XSS).
- **Refresh Token**: Stored in a `Secure`, `HttpOnly`, `SameSite=Strict` cookie. This mitigates XSS (JavaScript cannot access the cookie) and CSRF (SameSite policy prevents cross-origin sending).

---

## 7. Audit Log Cryptographic Integrity

To detect malicious tampering, deletion, or reordering of audit events by a compromised server or insider threat, the system implements a cryptographic hash chain.

### Chain Construction
- **Hash Function**: **SHA-256**.
- **Mechanism**: Each new audit event incorporates the hash of the immediately preceding event.
  `H_n = SHA256( EventData_n || H_{n-1} )`
- **Genesis Hash**: The first event in an organization's log uses a hardcoded, publicly known initialization vector as `H_0` (e.g., `SHA256("ZERO_KNOWLEDGE_VAULT_GENESIS_2024")`).

### Ordering Mechanism
The chain relies on a strict, gapless `sequence` integer (autoincrementing from 1).
Using `createdAt` timestamps is insufficient because timestamps can collide, be manipulated, or arrive out of order due to clock skew, breaking the deterministic chain verification.

### Tampering Detection
An administrator's client can periodically fetch the audit log and recalculate the hashes.
- **Modification**: Changing `EventData_n` invalidates `H_n` and all subsequent hashes.
- **Deletion/Reordering**: Removing or swapping events breaks the linkage, as `H_{n-1}` recorded in the database will no longer match the computed hash of the preceding record.

### Limitations
A hash chain guarantees detection of modification of *past* events. However, a server with root access can still perform a **truncation attack**: deleting the most recent `N` events. Since the client does not know the latest state of the chain, it cannot distinguish between "no new events occurred" and "events were deleted from the tail".

### Future Mitigation
Future phases will implement a **Signed Audit Log Root**. The server will periodically generate a Merkle Tree root of the audit log and cryptographically sign it with a dedicated auditing key, publishing this signature to an append-only transparency ledger or distributing it to admin clients.

---

## 8. Random Number Generation

Cryptography is only as strong as its source of entropy.

### Client-Side (Browser/Desktop/Mobile App)
- **Requirement**: ALL random numbers for keys, nonces, IVs, salts, and passwords MUST be generated using the Web Crypto API: `window.crypto.getRandomValues(new Uint8Array(size))`.
- **Prohibition**: The use of `Math.random()` or equivalent non-cryptographic PRNGs is strictly forbidden for any security-relevant operation.

### Server-Side (Node.js)
- **Requirement**: Use `crypto.randomBytes(size)` which interfaces directly with the OS CSPRNG (e.g., `/dev/urandom`).

### Password Generator Specification
The built-in secure password generator utilizes a CSPRNG to pick characters from defined alphabets.
- **Algorithm**: Rejection sampling to ensure uniform distribution and avoid modulo bias.
- **Policy**: Configurable length (default `20`), enforcing minimum counts for uppercase, lowercase, numbers, and symbols.

---

## 9. Key Rotation

Key rotation limits the amount of data encrypted under a single key and mitigates the impact of potential key compromise.

### Rotation Specifications

#### Vault Encryption Key (VEK) Rotation
- **Trigger Conditions**: User initiates a "Vault Re-key" due to suspected device compromise, or organizational policy dictates annual rotation.
- **Procedure**:
  1. Client generates a new VEK_new via CSPRNG.
  2. Client encrypts VEK_new with the current KEK and uploads it to the server.
  3. Client downloads all vault items.
  4. Client decrypts items using VEK_old.
  5. Client encrypts items using VEK_new.
  6. Client uploads new ciphertexts in a batch transaction.
  7. Server safely discards VEK_old ciphertext.
- **Atomicity**: The server exposes a `/api/vault/rotate` endpoint that accepts the new key and all new ciphertexts in a single atomic database transaction. If the connection drops midway, the transaction rolls back, preventing a corrupted state where some items use VEK_new and others use VEK_old.

#### Master Password Rotation
- **Trigger**: User request.
- **Procedure**:
  1. User inputs Old Password and New Password.
  2. Client derives KEK_old and decrypts the VEK.
  3. Client derives MEK_new from New Password + New Salt.
  4. Client derives Auth_Hash_new and KEK_new.
  5. Client encrypts the existing VEK with KEK_new.
  6. Client submits Auth_Hash_new, New Salt, and the newly encrypted VEK to the server.
  7. Server updates credentials. Vault items do NOT need re-encryption because the VEK has not changed.

---

## 10. Account Recovery

Because the server has zero knowledge of the master password or the keys, traditional "Forgot Password" email links are mathematically impossible.

### Recovery Paths

#### Recovery Codes
- **Generation**: During account creation, the client generates a 256-bit recovery key via CSPRNG. This key is encoded into a human-readable format (e.g., `8 × 6` alphanumeric blocks: `ABCD12-EFGH34-...`).
- **Storage**: 
  - The client encrypts the VEK using the Recovery Key and uploads this ciphertext to the server.
  - The server hashes the Recovery Key (using bcrypt/Argon2) to authenticate the recovery request.
- **Usage**: User enters the Recovery Code. The server verifies the hash. If successful, it returns the recovery-encrypted VEK. The client decrypts the VEK, allows the user to set a new master password, and re-encrypts the VEK under the new KEK.

#### Emergency Access (Trusted Contact)
- **Model**: User A delegates access to User B.
- **Flow**:
  1. User A retrieves User B's Public Key.
  2. User A encrypts their VEK using User B's Public Key (via ECDH/HKDF/AES).
  3. User A uploads this "Escrowed Key" to the server, with a time-delay policy (e.g., 7 days).
  4. User B requests access. User A is notified.
  5. If User A does not deny the request within 7 days, the server releases the Escrowed Key to User B.
  6. User B decrypts the key using their Private Key and gains access to User A's vault.

#### Data Loss Reality
If a user forgets their master password, loses all active sessions, and has not configured Recovery Codes or Emergency Access, **the vault is permanently, mathematically irretrievable.** The data is cryptographically shredded by definition of the architecture.

---

## 11. Cryptographic Compliance

The architecture is designed to align with stringent enterprise and government standards:

- **FIPS 140-2 / 140-3 Alignment**: The system utilizes FIPS-approved algorithms for core operations: AES-256 (FIPS 197), SHA-256 (FIPS 180-4), HMAC (FIPS 198-1). Implementations can be swapped for FIPS-validated cryptographic modules (e.g., WebCrypto via BoringSSL/NSS in FIPS mode).
- **NIST SP 800-57**: Adheres to guidelines for key management, utilizing 256-bit keys for all symmetric operations, providing >128 bits of security strength (suitable for protection beyond 2030).
- **NIST SP 800-38D**: Compliant with AES-GCM recommendations, strictly enforcing 96-bit IVs and 128-bit authentication tags.
- **RFC 9106**: Compliant with Argon2id memory and time cost recommendations for modern applications.
- **OWASP Cryptographic Storage Cheat Sheet**: Aligns with all recommendations for random number generation, AEAD usage, and secure password hashing.

---

## 12. What The Server Never Sees

The core zero-knowledge guarantee is validated by strictly analyzing what data touches the server infrastructure.

| Cryptographic Field | What Server Stores | What Server Sees at Runtime | Zero-Knowledge Guarantee |
| :--- | :--- | :--- | :--- |
| **Master Password** | *Nothing* | *Nothing* | Server never receives the plaintext password. |
| **Auth Hash** | Argon2/Bcrypt hash of Auth Hash | The 256-bit Auth Hash (in memory during login) | Even if intercepted, the Auth Hash cannot be used to derive the KEK or decrypt the vault. |
| **Master Encryption Key (MEK)** | *Nothing* | *Nothing* | MEK never leaves the client device. |
| **Key Encryption Key (KEK)** | *Nothing* | *Nothing* | KEK never leaves the client device. |
| **Vault Encryption Key (VEK)** | Ciphertext (AES-256-GCM) | Ciphertext | VEK is entirely opaque to the server; server lacks the KEK to decrypt it. |
| **User Private Key (X25519)** | Ciphertext (AES-256-GCM) | Ciphertext | Encrypted under the VEK, which the server cannot access. |
| **Vault Item (Passwords, Notes)** | Ciphertext (AES-256-GCM) | Ciphertext | Encrypted under the VEK. Server only sees blob size. |
| **Recovery Code** | Hash (Bcrypt/Argon2) | Plaintext Code (only during active recovery request) | Server cannot proactively initiate recovery; it only verifies user input. |
| **Audit Log Events** | Plaintext + SHA256 Hash | Plaintext | Audit events metadata (IP, time, action type) are visible for auditing, but item content is absent. |

By adhering to this matrix, the system mathematically guarantees that a complete compromise of the database and application servers results in zero exposure of user plaintext vault data.
