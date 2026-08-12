# 04 — API Specification

## 1. API Design Principles
- **RESTful Architecture**: The API adheres strictly to RESTful design principles. Resource URIs use nouns, not verbs. Actions on resources are defined by standard HTTP methods:
  - `GET`: Retrieve a resource or a list of resources. Safe and idempotent.
  - `POST`: Create a new resource or execute a complex operation not easily mapped to CRUD. Not idempotent.
  - `PUT`: Completely replace an existing resource. Idempotent.
  - `PATCH`: Partially update an existing resource. Not strictly idempotent.
  - `DELETE`: Remove a resource. Idempotent.
- **JSON Standard**: All requests with a body must send `Content-Type: application/json`. All responses, both success and error, will be returned as `Content-Type: application/json`.
- **Versioning**: All API endpoints are versioned to ensure backward compatibility. The current version is strictly `/api/v1/`.
- **Timestamps**: Every single timestamp received or returned by the API is formatted as a strict ISO 8601 string in UTC timezone (e.g., `2024-05-20T14:30:00Z`). Local times are never accepted.
- **Identifiers**: 
  - Sequential IDs (e.g., auto-incrementing integers) are strictly forbidden to prevent enumeration and IDOR (Insecure Direct Object Reference) attacks.
  - All resource IDs are UUIDv4 strings.
- **Rate Limiting**: Rate limiting is strictly enforced on all endpoints to prevent brute-force and DDoS attacks. Rate limits are defined per-endpoint and can vary based on the operation's sensitivity. Rate limit metadata is included in the response headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`).
- **Error Handling**: 
  - The API returns standard HTTP status codes (e.g., 200, 201, 400, 401, 403, 404, 429, 500).
  - Every error response follows a strict JSON envelope containing `error` (human readable string), `code` (application-specific error code string), and `request_id` (for tracing).
- **Authentication Strategy**: 
  - Stateless Bearer JWTs are used for authentication.
  - Access tokens are short-lived (e.g., 15 minutes) and passed in the `Authorization` header as `Bearer <token>`.
- **Refresh Tokens Strategy**:
  - Refresh tokens are long-lived and strictly issued as `httpOnly`, `Secure`, `SameSite=Strict` cookies.
  - Refresh tokens are NEVER returned in the JSON body and NEVER sent by the client in the Authorization header, preventing exfiltration via Cross-Site Scripting (XSS).
- **Zero-Knowledge Architecture (ZKA)**:
  - The server is mathematically incapable of accessing user plaintext data.
  - The server NEVER receives, processes, or returns plaintext passwords, master passwords, or encryption keys.
  - All cryptographic operations involving the Master Key occur exclusively on the client-side.
  - The server only receives a derived authentication hash (`auth_hash`) used for verifying identity, and opaque encrypted ciphertext used for storage.

---

## 2. Standard Response Envelopes

To provide a consistent developer experience, all API responses adhere to predefined structures.

### Success Envelope

For successful operations that return data, the data is returned at the root of the JSON object, or wrapped in a specific property if paginated.

```typescript
// Standard response for a single item or specific resource
interface SingleResourceResponse<T> {
  // Direct inclusion of properties for a single object response
  [key: string]: any;
}

// Example representation of a User object:
interface UserResponse {
  id: string;
  email: string;
  created_at: string;
  updated_at: string;
}

// Standard response for paginated collections
interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  };
}
```

### Error Envelope

For any operation resulting in a 4xx or 5xx status code, the API returns a structured error object. This guarantees clients can programmatically handle errors without parsing strings.

```typescript
interface ErrorResponse {
  error: string;          // Human-readable error description
  code: string;           // Application-specific error code (e.g., "AUTH_INVALID_CREDENTIALS")
  request_id: string;     // Unique UUIDv4 identifier for the request for tracing in backend logs
  details?: any;          // Optional field for validation error specifics (e.g., form field errors)
}
```

---

## 3. Authentication API (`/api/v1/auth`)

The authentication API is the most critical part of the zero-knowledge architecture. Extreme care must be taken to implement these endpoints exactly as specified.

### 3.1. `POST /api/v1/auth/register`
**Description**: Creates a new user account. In a zero-knowledge system, the client derives an `auth_hash` and generates a Master Encryption Key (MEK) locally. The MEK is encrypted with a Key Encryption Key (KEK) derived from the Master Password. The server receives the `auth_hash` for future authentication and the `protected_mek` for storage.
**Headers**: `Content-Type: application/json`
**Rate Limit**: 5 requests per hour per IP.
**Error Codes**: `AUTH_EMAIL_IN_USE`, `VAL_INVALID_INPUT`, `AUTH_WEAK_CRYPTO_PARAMS`
**Zero-Knowledge Note**: The server receives `auth_hash` (derived via Argon2id from email + master password), NOT the master password. `protected_mek` is completely opaque to the server.

```typescript
interface RegisterRequest {
  email: string;
  auth_hash: string;       // Base64-encoded authentication hash (Argon2id output)
  protected_mek: string;   // Master Encryption Key encrypted with the KEK (AES-256-GCM)
  kdf_params: {
    iterations: number;
    memory: number;      // in KB
    parallelism: number;
    salt: string;        // Base64 encoded random salt
    version: number;     // e.g., Argon2id v19
  };
  device_id: string;       // Client-generated UUID for the registering device
  device_name: string;     // User-friendly name (e.g., "Chrome on Mac")
}

interface RegisterResponse {
  user: {
    id: string;
    email: string;
    created_at: string;
  };
}
```

### 3.2. `POST /api/v1/auth/login/initiate`
**Description**: Fetches Key Derivation Function (KDF) parameters for a specific email BEFORE the user enters their password. This is required for the client to derive the `auth_hash` using the correct salt and cost parameters stored for that specific user.
**Headers**: `Content-Type: application/json`
**Rate Limit**: 10 requests per minute per IP.
**Error Codes**: `AUTH_USER_NOT_FOUND`
**Zero-Knowledge Note**: To prevent user enumeration attacks via timing, this endpoint MUST execute a dummy KDF parameter lookup taking a constant time, and return dummy KDF parameters if the email does not exist in the database.

```typescript
interface LoginInitiateRequest {
  email: string;
}

interface LoginInitiateResponse {
  kdf_params: {
    iterations: number;
    memory: number;
    parallelism: number;
    salt: string;
  };
}
```

### 3.3. `POST /api/v1/auth/login/complete`
**Description**: Completes the login process by verifying the client-provided `auth_hash` against the stored hash. If successful, returns an access token in the JSON body, the user's `protected_mek`, and sets the refresh token in an `httpOnly` cookie.
**Headers**: `Content-Type: application/json`
**Rate Limit**: 5 requests per minute per IP.
**Error Codes**: `AUTH_INVALID_CREDENTIALS`, `AUTH_MFA_REQUIRED`, `AUTH_ACCOUNT_LOCKED`
**Zero-Knowledge Note**: If the user has MFA enabled, this endpoint will return `403 Forbidden` with an `AUTH_MFA_REQUIRED` code and an MFA token to be used in the subsequent MFA verify step.

```typescript
interface LoginCompleteRequest {
  email: string;
  auth_hash: string;
  device_id: string;
  device_name: string;
}

interface LoginCompleteResponse {
  access_token: string;    // JWT access token
  expires_in: number;      // Seconds until token expires (e.g., 900 for 15 mins)
  user: {
    id: string;
    email: string;
  };
  protected_mek: string;   // Required for the client to decrypt vault offline
}
```

### 3.4. `POST /api/v1/auth/logout`
**Description**: Revokes the current session. Invalidates the refresh token in the database and clears the `httpOnly` cookie.
**Headers**: `Authorization: Bearer <token>`
**Rate Limit**: 10 requests per minute per User.
**Error Codes**: `AUTH_UNAUTHORIZED`

```typescript
// Request Body: Empty
// Response Body: Empty (204 No Content)
// Note: Backend MUST clear the refresh_token cookie in the response headers.
```

### 3.5. `POST /api/v1/auth/refresh`
**Description**: Exchanges a valid refresh token (provided automatically by the browser via the `httpOnly` cookie) for a new access token and a newly rotated refresh token. This implements token rotation for security.
**Headers**: Cookie header must contain the `refresh_token`.
**Rate Limit**: 10 requests per minute per IP.
**Error Codes**: `AUTH_INVALID_REFRESH_TOKEN`, `AUTH_SESSION_EXPIRED`
**Zero-Knowledge Note**: The server verifies the refresh token against the database, revokes the old one, issues a new one, sets the new cookie, and returns the new short-lived access token.

```typescript
// Request Body: Empty (Token is read from the cookie)
interface RefreshResponse {
  access_token: string;
  expires_in: number;
}
```

### 3.6. `POST /api/v1/auth/mfa/totp/setup`
**Description**: Initiates Time-Based One-Time Password (TOTP) setup. Generates a new TOTP secret on the server and returns it alongside a standard `otpauth://` URI for QR code generation on the client.
**Headers**: `Authorization: Bearer <token>`
**Rate Limit**: 5 requests per hour per User.
**Error Codes**: `AUTH_MFA_ALREADY_SETUP`

```typescript
// Request Body: Empty
interface TotpSetupResponse {
  secret: string;    // Base32 encoded TOTP secret
  uri: string;       // otpauth URI for QR code generation
}
```

### 3.7. `POST /api/v1/auth/mfa/totp/verify`
**Description**: Verifies a TOTP code. Used for two purposes: 1) Finalizing the TOTP setup while logged in, or 2) Completing the login flow when prompted with `AUTH_MFA_REQUIRED`.
**Headers**: `Authorization: Bearer <token>` (if setting up) or `Content-Type: application/json` (if logging in, typically passing an MFA verification token).
**Rate Limit**: 5 requests per minute per IP.
**Error Codes**: `AUTH_INVALID_TOTP_CODE`, `AUTH_MFA_SESSION_EXPIRED`

```typescript
interface TotpVerifyRequest {
  code: string;           // 6-digit TOTP code
  mfa_token?: string;     // Token provided from /login/complete if in login flow
}

interface TotpVerifyResponse {
  success: boolean;
  access_token?: string;  // Present if this verification completes a login flow
  protected_mek?: string; // Present if this verification completes a login flow
}
```

### 3.8. `POST /api/v1/auth/mfa/webauthn/register/begin`
**Description**: Starts WebAuthn (FIDO2) device registration.
**Headers**: `Authorization: Bearer <token>`
**Rate Limit**: 5 requests per hour per User.
**Error Codes**: `AUTH_UNAUTHORIZED`

```typescript
// Response returns the standard WebAuthn PublicKeyCredentialCreationOptions object.
// (Omitted strict typing here as it relies on standard WebAuthn specs).
```

### 3.9. `POST /api/v1/auth/mfa/webauthn/register/complete`
**Description**: Completes WebAuthn registration by verifying the attestation object.
**Headers**: `Authorization: Bearer <token>`

### 3.10. `POST /api/v1/auth/mfa/webauthn/authenticate/begin`
**Description**: Starts WebAuthn authentication during the login flow.
**Headers**: `Content-Type: application/json`

### 3.11. `POST /api/v1/auth/mfa/webauthn/authenticate/complete`
**Description**: Completes WebAuthn authentication by verifying the assertion object.

### 3.12. `GET /api/v1/auth/sessions`
**Description**: Lists all active sessions for the authenticated user, allowing them to review and revoke access on other devices.
**Headers**: `Authorization: Bearer <token>`
**Rate Limit**: 30 requests per minute per User.

```typescript
interface SessionResponse {
  id: string;              // Session UUID
  device_name: string;     // e.g., "Chrome on Windows 11"
  ip_address: string;
  last_active: string;     // ISO 8601 timestamp
  created_at: string;      // ISO 8601 timestamp
  is_current: boolean;     // True if this session matches the current access token
}

type SessionsListResponse = PaginatedResponse<SessionResponse>;
```

### 3.13. `DELETE /api/v1/auth/sessions/:id`
**Description**: Revokes a specific session by its UUID.
**Headers**: `Authorization: Bearer <token>`
**Rate Limit**: 10 requests per minute per User.
**Error Codes**: `RES_NOT_FOUND`

### 3.14. `POST /api/v1/auth/recovery/setup`
**Description**: Generates new recovery codes. Any existing recovery codes for the user are immediately invalidated.
**Headers**: `Authorization: Bearer <token>`
**Rate Limit**: 5 requests per day per User.

```typescript
// Request Body: Empty
interface RecoverySetupResponse {
  codes: string[]; // Array of 10-12 character alphanumeric recovery codes
}
```

### 3.15. `POST /api/v1/auth/recovery/use`
**Description**: Uses a recovery code to bypass MFA or regain access to an account.
**Headers**: `Content-Type: application/json`

### 3.16. `POST /api/v1/auth/change-master-password`
**Description**: Allows a user to change their Master Password. Because the server does not know the master password, the client must derive the new KEK, re-encrypt the MEK with the new KEK to produce a `new_protected_mek`, and generate a `new_auth_hash`.
**Headers**: `Authorization: Bearer <token>`
**Rate Limit**: 3 requests per hour per User.
**Error Codes**: `AUTH_INVALID_CREDENTIALS` (if current auth hash is wrong)
**Zero-Knowledge Note**: The server verifies `current_auth_hash`, then replaces the stored hash, KDF params, and protected MEK with the new ones.

```typescript
interface ChangeMasterPasswordRequest {
  current_auth_hash: string;
  new_auth_hash: string;
  new_protected_mek: string;
  new_kdf_params: {
    iterations: number;
    memory: number;
    parallelism: number;
    salt: string;
  };
}
```

---

## 4. Vault Items API (`/api/v1/vault`)

The Vault Items API is responsible for storing and retrieving encrypted blobs of data. The server is completely unaware of the contents of these blobs.

### 4.1. `GET /api/v1/vault/items`
**Description**: Lists all items in the user's vault. Returns the ciphertext which must be decrypted client-side.
**Headers**: `Authorization: Bearer <token>`
**Rate Limit**: 100 requests per minute per User.

```typescript
interface VaultItem {
  id: string;
  folder_id: string | null;
  type: "LOGIN" | "SECURE_NOTE" | "CREDIT_CARD" | "IDENTITY";
  ciphertext: string; // The encrypted payload (JSON stringified and Base64 encoded)
  iv: string;         // Initialization vector (Base64)
  mac: string;        // Message authentication code (Base64)
  created_at: string;
  updated_at: string;
  favorite: boolean;
}

type VaultItemsResponse = PaginatedResponse<VaultItem>;
```

### 4.2. `POST /api/v1/vault/items`
**Description**: Creates a new vault item.
**Headers**: `Authorization: Bearer <token>`
**Rate Limit**: 50 requests per minute per User.

```typescript
interface CreateItemRequest {
  folder_id?: string | null;
  type: "LOGIN" | "SECURE_NOTE" | "CREDIT_CARD" | "IDENTITY";
  ciphertext: string;
  iv: string;
  mac: string;
  favorite?: boolean;
}

// Response returns the created VaultItem object.
```

### 4.3. `GET /api/v1/vault/items/:id`
**Description**: Gets a specific item by its UUID.
**Headers**: `Authorization: Bearer <token>`
**Error Codes**: `RES_NOT_FOUND`

### 4.4. `PUT /api/v1/vault/items/:id`
**Description**: Completely updates an existing vault item. A new version is created in the history.
**Headers**: `Authorization: Bearer <token>`

```typescript
interface UpdateItemRequest {
  folder_id?: string | null;
  type: "LOGIN" | "SECURE_NOTE" | "CREDIT_CARD" | "IDENTITY";
  ciphertext: string;
  iv: string;
  mac: string;
  favorite: boolean;
}
```

### 4.5. `DELETE /api/v1/vault/items/:id`
**Description**: Soft deletes an item, moving it to the trash bin. Soft-deleted items are excluded from standard `GET /vault/items` responses.
**Headers**: `Authorization: Bearer <token>`

### 4.6. `POST /api/v1/vault/items/:id/restore`
**Description**: Restores an item from the trash bin back to the active vault.
**Headers**: `Authorization: Bearer <token>`

### 4.7. `DELETE /api/v1/vault/items/:id/permanent`
**Description**: Permanently deletes an item from the database. This action cannot be undone.
**Headers**: `Authorization: Bearer <token>`

### 4.8. `GET /api/v1/vault/items/:id/versions`
**Description**: Gets the historical versions of a specific item, allowing users to view past passwords or notes.
**Headers**: `Authorization: Bearer <token>`

```typescript
interface VaultItemVersion {
  version_id: string;
  item_id: string;
  ciphertext: string;
  iv: string;
  mac: string;
  created_at: string; // The time this specific version was created
}

type ItemVersionsResponse = PaginatedResponse<VaultItemVersion>;
```

### 4.9. `POST /api/v1/vault/items/:id/restore-version/:versionId`
**Description**: Restores a specific historical version of an item to become the current active version.
**Headers**: `Authorization: Bearer <token>`

### 4.10. `GET /api/v1/vault/trash`
**Description**: Lists all soft-deleted items currently residing in the trash.
**Headers**: `Authorization: Bearer <token>`
**Response**: Similar to `GET /vault/items` but only returns items flagged as deleted.

### 4.11. `POST /api/v1/vault/items/:id/attachments`
**Description**: Uploads a file attachment. The file MUST be encrypted by the client before transmission. The server just stores the encrypted binary blob.
**Content-Type**: `multipart/form-data`
**Headers**: `Authorization: Bearer <token>`
**Rate Limit**: 20 requests per minute per User.

### 4.12. `GET /api/v1/vault/items/:id/attachments/:attachmentId`
**Description**: Downloads an encrypted attachment. The client is responsible for decrypting the downloaded stream.

---

## 5. Folders API (`/api/v1/vault/folders`)

Organize vault items into a hierarchical folder structure. Like items, folder names are encrypted by the client.

### 5.1. `GET /api/v1/vault/folders`
**Description**: Retrieve a list of all folders in the user's vault.

```typescript
interface Folder {
  id: string;
  parent_id: string | null; // For nested folders
  ciphertext: string;       // Encrypted folder metadata (name, color, etc.)
  iv: string;
  mac: string;
  created_at: string;
  updated_at: string;
}
```

### 5.2. `POST /api/v1/vault/folders`
**Description**: Create a new folder.

```typescript
interface CreateFolderRequest {
  parent_id?: string | null;
  ciphertext: string;
  iv: string;
  mac: string;
}
```

### 5.3. `GET /api/v1/vault/folders/:id`
**Description**: Get a specific folder by ID.

### 5.4. `PUT /api/v1/vault/folders/:id`
**Description**: Update folder data (e.g., changing its name/ciphertext or moving it to a new parent).

### 5.5. `DELETE /api/v1/vault/folders/:id`
**Description**: Delete a folder. This usually requires recursively handling items within the folder (e.g., moving them to the root or also deleting them).

---

## 6. Organisation API (`/api/v1/orgs`)

For enterprise usage, the API supports organizations, which have their own shared collections and access controls.

### 6.1. `POST /api/v1/orgs`
**Description**: Creates a new organization.
**Headers**: `Authorization: Bearer <token>`

```typescript
interface CreateOrgRequest {
  name: string; // Typically plaintext, as org names are often public knowledge within an enterprise
  billing_email: string;
}
```

### 6.2. `GET /api/v1/orgs/:id`
**Description**: Retrieves details for a specific organization the user belongs to.

### 6.3. `POST /api/v1/orgs/:id/members/invite`
**Description**: Invites a new user to the organization via email.
**Headers**: `Authorization: Bearer <token>`

### 6.4. `GET /api/v1/orgs/:id/members`
**Description**: Lists all members of an organization.

### 6.5. `PATCH /api/v1/orgs/:id/members/:userId/role`
**Description**: Changes a member's role (e.g., from 'user' to 'admin' or 'owner').

### 6.6. `DELETE /api/v1/orgs/:id/members/:userId`
**Description**: Removes a member from the organization.

### 6.7. `GET /api/v1/orgs/:id/groups`
**Description**: Lists groups within the organization. Groups are used for bulk-assigning permissions to collections.

### 6.8. `POST /api/v1/orgs/:id/groups`
**Description**: Creates a new group within the organization.

### 6.9. `POST /api/v1/orgs/:id/groups/:groupId/members`
**Description**: Adds an existing organization member to a specific group.

### 6.10. `GET /api/v1/orgs/:id/collections`
**Description**: Lists all collections (shared folders) within the organization that the user has access to.

### 6.11. `POST /api/v1/orgs/:id/collections`
**Description**: Creates a new organization collection. The creator generates a Collection Key, encrypts it with their own public key, and stores the encrypted collection item.

### 6.12. `POST /api/v1/orgs/:id/collections/:collectionId/members`
**Description**: Shares a collection with a specific user or group by encrypting the Collection Key with the recipient's public key.

---

## 7. Audit API (`/api/v1/audit`)

Provides an immutable, cryptographically verifiable trail of all actions performed within an account or organization.

### 7.1. `GET /api/v1/audit`
**Description**: Retrieves a paginated list of audit log events.
**Headers**: `Authorization: Bearer <token>`

```typescript
interface AuditLogEntry {
  id: string;
  event_type: string;     // e.g., "ITEM_CREATED", "USER_LOGIN_SUCCESS"
  actor_id: string;       // User ID who performed the action
  target_id: string | null; // ID of the resource affected (e.g., Item ID)
  ip_address: string;
  user_agent: string;
  timestamp: string;      // ISO 8601
  hash: string;           // Cryptographic hash of this entry + previous entry's hash
}

type AuditLogResponse = PaginatedResponse<AuditLogEntry>;
```

### 7.2. `GET /api/v1/audit/verify`
**Description**: Re-calculates the hash chain of the entire audit log on the server to verify integrity.
**Headers**: `Authorization: Bearer <token>`

```typescript
interface AuditVerifyResponse {
  valid: boolean;
  last_verified_entry_id: string;
  tampered_entry_id?: string; // Included if valid is false
}
```

---

## 8. Admin API (`/api/v1/admin`)

Endpoints restricted solely to users with the global `super-admin` role, intended for instance management.

### 8.1. `GET /api/v1/admin/users`
**Description**: Lists all users across the entire instance.

### 8.2. `POST /api/v1/admin/users/:id/suspend`
**Description**: Suspends a user, preventing them from logging in or using the API, without deleting their data.

### 8.3. `POST /api/v1/admin/users/:id/restore`
**Description**: Lifts a suspension on a user.

### 8.4. `GET /api/v1/admin/audit`
**Description**: Retrieves a global audit log spanning all organizations and users.

### 8.5. `GET /api/v1/admin/metrics`
**Description**: Retrieves usage metrics (e.g., total active users, vault size, database performance).

---

## 9. Rate Limiting Specification

Rate limiting is enforced using the `Token Bucket` algorithm via Redis. Limits are based on the client IP address or the authenticated User ID.

| Endpoint | Limit | Window | Scope | Notes |
|----------|-------|--------|-------|-------|
| `POST /auth/register` | 5 | 1 hour | Per IP | Prevent mass account creation. |
| `POST /auth/login/initiate` | 10 | 1 minute | Per IP | Stop email enumeration and brute force. |
| `POST /auth/login/complete` | 5 | 1 minute | Per IP | High security strict limit for auth attempts. |
| `POST /auth/refresh` | 10 | 1 minute | Per IP | Mitigate runaway refresh loops. |
| `GET /vault/*` | 100 | 1 minute | Per User | High limit for syncing operations. |
| `POST/PUT /vault/*` | 50 | 1 minute | Per User | Moderate limit for data mutations. |
| `GET /orgs/*` | 50 | 1 minute | Per User | Standard browsing limits. |
| `GET /audit/*` | 30 | 1 minute | Per User | Lower limit as log generation is expensive. |
| `GET /admin/*` | 30 | 1 minute | Per User | Admin operations are heavily rate-limited. |
| *All unlisted endpoints* | 60 | 1 minute | Per IP | Default fallback policy. |

---

## 10. Authentication Flow Diagrams

### Diagram 1: Registration Flow
```text
Client Application                                           Server (API)
------------------                                           ------------
1. Generate salt, memory, iterations (KDF params).
2. Derive KEK (Key Enc Key) using Master Password + KDF.
3. Generate random MEK (Master Enc Key).
4. Encrypt MEK with KEK -> produces protected_mek.
5. Derive auth_hash using Master Password + KDF.
6. HTTP POST /api/v1/auth/register 
   Payload: { email, auth_hash, protected_mek, kdf_params }
   -------------------------------------------------------->
                                                             7. Validate input.
                                                             8. Check if email exists.
                                                             9. Store email, auth_hash, params, mek.
                                                            10. Return 201 Created.
   <--------------------------------------------------------
11. Proceed to login flow.
```

### Diagram 2: Login Flow (with MFA)
```text
Client Application                                           Server (API)
------------------                                           ------------
1. User enters Email.
2. HTTP POST /api/v1/auth/login/initiate { email }
   -------------------------------------------------------->
                                                             3. Look up KDF params by email.
   <-------------------------------------------------------- 4. Return KDF params (or dummy).
5. User enters Master Password.
6. Derive KEK and auth_hash using returned KDF params.
7. HTTP POST /api/v1/auth/login/complete { email, auth_hash }
   -------------------------------------------------------->
                                                             8. Verify auth_hash.
                                                             9. Notice MFA is enabled.
   <-------------------------------------------------------- 10. Return 403 (AUTH_MFA_REQUIRED) + mfa_token.
11. Prompt user for TOTP.
12. User inputs 6-digit TOTP code.
13. HTTP POST /api/v1/auth/mfa/totp/verify { code, mfa_token }
   -------------------------------------------------------->
                                                            14. Verify TOTP code.
                                                            15. Generate access_token.
                                                            16. Set refresh_token httpOnly cookie.
   <-------------------------------------------------------- 17. Return 200 OK + access_token + protected_mek.
18. Decrypt protected_mek using KEK to get MEK.
19. Vault is unlocked locally!
```

### Diagram 3: Token Refresh Flow
```text
Client Application                                           Server (API)
------------------                                           ------------
1. Access token expires. Interceptor catches 401 Unauthorized.
2. HTTP POST /api/v1/auth/refresh
   Headers: Cookie: refresh_token=XYZ
   -------------------------------------------------------->
                                                             3. Read refresh_token from cookie.
                                                             4. Validate token against DB.
                                                             5. Invalidate old refresh_token.
                                                             6. Generate new access_token & new refresh_token.
                                                             7. Set new refresh_token in httpOnly Cookie.
   <-------------------------------------------------------- 8. Return 200 OK + new access_token.
9. Client updates local access_token.
10. Client retries original failed request.
```

### Diagram 4: Master Password Change Flow
```text
Client Application                                           Server (API)
------------------                                           ------------
1. User enters current Master Pass and new Master Pass.
2. Derive current KEK and new KEK.
3. Decrypt MEK using current KEK.
4. Encrypt MEK using new KEK -> new_protected_mek.
5. Derive current_auth_hash and new_auth_hash.
6. HTTP POST /api/v1/auth/change-master-password
   Payload: { current_auth_hash, new_auth_hash, ... }
   -------------------------------------------------------->
                                                             7. Verify current_auth_hash.
                                                             8. Replace old hashes, params, and mek with new.
                                                             9. Invalidate all active sessions.
   <-------------------------------------------------------- 10. Return 200 OK.
11. Client forces user to log in again with new password.
```

---

## 11. Error Code Reference

When building frontend applications, map these specific `code` strings to user-friendly messages and UI states, rather than relying on the HTTP status code alone.

| Code | HTTP Status | Message | Description |
|------|-------------|---------|-------------|
| `AUTH_INVALID_CREDENTIALS` | 400 | Invalid Credentials | `auth_hash` verification failed during login or password change. |
| `AUTH_USER_NOT_FOUND` | 404 | User Not Found | No user is associated with the provided email address. |
| `AUTH_MFA_REQUIRED` | 403 | MFA Required | The user has 2FA enabled and must provide a token. |
| `AUTH_ACCOUNT_LOCKED` | 403 | Account Locked | Too many failed login attempts; account locked temporarily. |
| `AUTH_UNAUTHORIZED` | 401 | Unauthorized | Missing, invalid, or expired access token. |
| `AUTH_SESSION_EXPIRED` | 401 | Session Expired | The refresh token is invalid or has expired; requires re-login. |
| `AUTH_EMAIL_IN_USE` | 409 | Email in Use | Registration attempted with an already registered email. |
| `AUTH_WEAK_CRYPTO_PARAMS`| 400 | Weak Crypto | The client-provided KDF parameters are below the minimum acceptable security threshold. |
| `VAL_INVALID_INPUT` | 400 | Invalid Input | The request payload failed schema validation. Check `details` array. |
| `RES_NOT_FOUND` | 404 | Resource Not Found | The requested vault item, folder, or organization does not exist. |
| `RATE_LIMIT_EXCEEDED` | 429 | Too Many Requests | The client has exceeded the API rate limit for this endpoint. |
| `ORG_PERMISSION_DENIED` | 403 | Permission Denied | User lacks the required organization role to perform the action. |
| `SYS_INTERNAL_ERROR` | 500 | Internal Server Error | An unexpected server-side exception occurred. Try again later. |
| `SYS_MAINTENANCE` | 503 | Service Unavailable | The API is currently down for scheduled maintenance. |

---

## 12. Security Headers

To ensure defense-in-depth, the API backend (Express/Go/Rust) or the API Gateway/Reverse Proxy (NGINX, Cloudflare) must inject the following strict security headers into EVERY HTTP response.

1. **Strict-Transport-Security (HSTS)**
   - Header: `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`
   - Purpose: Forces browsers to only connect via HTTPS for the next 2 years.

2. **Content-Security-Policy (CSP)**
   - Header: `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`
   - Purpose: As an API, it should not be loading scripts, images, or frames. Setting default-src to none prevents malicious content injection.

3. **X-Frame-Options**
   - Header: `X-Frame-Options: DENY`
   - Purpose: Prevents the API responses from being framed by external sites, mitigating clickjacking.

4. **X-Content-Type-Options**
   - Header: `X-Content-Type-Options: nosniff`
   - Purpose: Prevents the browser from MIME-sniffing a response away from the declared content-type, preventing malicious executable scripts disguised as JSON.

5. **Referrer-Policy**
   - Header: `Referrer-Policy: strict-origin-when-cross-origin`
   - Purpose: Prevents the browser from sending full URL paths (which might contain sensitive query params) in the Referer header to external domains.

6. **Cache-Control**
   - Header: `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0`
   - Purpose: Ensures that sensitive zero-knowledge data (encrypted blobs, KDF params) are NEVER cached by intermediate proxies or the browser cache.

7. **Pragma**
   - Header: `Pragma: no-cache`
   - Purpose: Legacy HTTP/1.0 backward compatibility for caching prevention.

8. **Permissions-Policy**
   - Header: `Permissions-Policy: geolocation=(), microphone=(), camera=()`
   - Purpose: Explicitly restricts the API context from accessing powerful browser features.

---
// End of Specification Document
