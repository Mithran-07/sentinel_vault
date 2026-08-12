# 03 — Database Schema

## 1. Design Principles

The database schema for the enterprise-grade zero-knowledge password vault is designed around the following core principles:

1.  **Zero-Knowledge Architecture:** No plaintext secrets or passwords are ever stored in the database. All sensitive payload data must be encrypted client-side before transmission. The server only stores ciphertext, initialization vectors (IVs), and encrypted keys.
2.  **UUID Primary Keys:** All tables use UUIDv4 for primary keys rather than sequential integers. This prevents object enumeration attacks and makes data merging or sharding easier in the future.
3.  **Strict Auditability:** All changes to sensitive data (vault items, permissions, access controls) are tracked through append-only audit logs. The `audit_events` table is designed to be immutable and tamper-evident using cryptographic chaining.
4.  **Soft Deletion:** Vault items and other critical entities use soft deletes (`deleted_at`) to support a "Trash" feature, allowing recovery of accidentally deleted items for a configured retention period.
5.  **Versioning:** Vault items maintain a history of changes via the `vault_item_versions` table, enabling users to rollback to previous versions of their stored secrets.
6.  **Tenant Isolation:** The schema is designed for multi-tenancy. Organisational data is strictly partitioned by `org_id`.
7.  **Time Representation:** All timestamps are stored in UTC (`TIMESTAMP WITH TIME ZONE` in PostgreSQL) to ensure global consistency.

---

## 2. Entity Relationship Overview

```text
+-------------------+       +--------------------+       +----------------------+
|       users       |-------|   organisations    |-------|organisation_members|
|-------------------|       |--------------------|       |----------------------|
| id (PK)           |       | id (PK)            |       | id (PK)              |
| email_hash        |       | owner_user_id (FK) |       | org_id (FK)          |
| ...               |       | ...                |       | user_id (FK)         |
+-------------------+       +--------------------+       +----------------------+
        |                             |                            |
        | 1:N                         | 1:N                        | 1:N
        v                             v                            v
+-------------------+       +--------------------+       +----------------------+
|      vaults       |-------|       groups       |-------|    group_members     |
|-------------------|       |--------------------|       |----------------------|
| id (PK)           |       | id (PK)            |       | group_id (FK)        |
| org_id (FK)       |       | org_id (FK)        |       | user_id (FK)         |
| user_id (FK)      |       +--------------------+       +----------------------+
+-------------------+                 |
        | 1:N                         |
        v                             |
+-------------------+                 |
|   vault_items     |                 |
|-------------------|                 |
| id (PK)           |                 |
| vault_id (FK)     |                 |
| ciphertext        |                 |
+-------------------+                 |
        | 1:N                         |
        v                             |
+-------------------+                 |
|    collections    |<----------------+
|-------------------|
| id (PK)           |
| org_id (FK)       |
+-------------------+
```

---

## 3. Complete Table Definitions

### Identity & Auth

#### `users`
**Description:** Central identity table for all users. Stores authentication parameters and the encrypted Master Key (Vault Encryption Key - VEK).

**PostgreSQL DDL:**
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_hash VARCHAR(255) NOT NULL UNIQUE, -- For fast lookups
    email_encrypted TEXT NOT NULL, -- Plaintext email, encrypted
    auth_hash VARCHAR(255) NOT NULL, -- SRP or Argon2id verifier
    kdf_salt VARCHAR(255) NOT NULL,
    kdf_params JSONB NOT NULL, -- { "alg": "argon2id", "t": 3, "m": 65536, "p": 4 }
    encrypted_vault_key_ciphertext TEXT NOT NULL,
    encrypted_vault_key_iv VARCHAR(255) NOT NULL,
    public_key TEXT NOT NULL, -- Ed25519 or RSA public key for sharing
    encrypted_private_key TEXT NOT NULL,
    private_key_iv VARCHAR(255) NOT NULL,
    account_status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE,
    last_login_ip INET
);

CREATE INDEX idx_users_email_hash ON users(email_hash);
CREATE INDEX idx_users_account_status ON users(account_status);
```

**Prisma Schema:**
```prisma
model User {
  id                             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  emailHash                      String    @unique @map("email_hash") @db.VarChar(255)
  emailEncrypted                 String    @map("email_encrypted")
  authHash                       String    @map("auth_hash") @db.VarChar(255)
  kdfSalt                        String    @map("kdf_salt") @db.VarChar(255)
  kdfParams                      Json      @map("kdf_params")
  encryptedVaultKeyCiphertext    String    @map("encrypted_vault_key_ciphertext")
  encryptedVaultKeyIv            String    @map("encrypted_vault_key_iv") @db.VarChar(255)
  publicKey                      String    @map("public_key")
  encryptedPrivateKey            String    @map("encrypted_private_key")
  privateKeyIv                   String    @map("private_key_iv") @db.VarChar(255)
  accountStatus                  String    @default("ACTIVE") @map("account_status") @db.VarChar(50)
  createdAt                      DateTime  @default(now()) @map("created_at") @db.Timestamptz
  updatedAt                      DateTime  @default(now()) @updatedAt @map("updated_at") @db.Timestamptz
  lastLoginAt                    DateTime? @map("last_login_at") @db.Timestamptz
  lastLoginIp                    String?   @map("last_login_ip") @db.Inet

  @@map("users")
}
```

#### `sessions`
**Description:** Tracks active user sessions, facilitating token refresh and device management.

**PostgreSQL DDL:**
```sql
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_family UUID NOT NULL, -- For detecting refresh token reuse
    last_token_hash VARCHAR(255) NOT NULL,
    device_fingerprint VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_family ON sessions(token_family);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at) WHERE revoked_at IS NULL;
```

#### `refresh_tokens`
**Description:** Individual refresh tokens linked to a session.

**PostgreSQL DDL:**
```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_refresh_tokens_session_id ON refresh_tokens(session_id);
```

#### `passkeys`
**Description:** WebAuthn credentials for passwordless login or MFA.

**PostgreSQL DDL:**
```sql
CREATE TABLE passkeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credential_id TEXT NOT NULL UNIQUE,
    public_key TEXT NOT NULL,
    sign_count INTEGER NOT NULL DEFAULT 0,
    device_type VARCHAR(50),
    name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_passkeys_user_id ON passkeys(user_id);
```

#### `mfa_methods`
**Description:** Additional Multi-Factor Authentication methods (e.g., TOTP).

**PostgreSQL DDL:**
```sql
CREATE TABLE mfa_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- TOTP, WEBAUTHN, RECOVERY
    secret_encrypted TEXT, -- Encrypted TOTP secret
    verified_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mfa_methods_user_id ON mfa_methods(user_id);
```

#### `recovery_codes`
**Description:** Backup codes for MFA recovery.

**PostgreSQL DDL:**
```sql
CREATE TABLE recovery_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    code_hash VARCHAR(255) NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_recovery_codes_user_id ON recovery_codes(user_id);
```

### Vault Core

#### `vaults`
**Description:** Logical containers for vault items. Can be personal or organisational.

**PostgreSQL DDL:**
```sql
CREATE TABLE vaults (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- Null for org vaults
    org_id UUID REFERENCES organisations(id) ON DELETE CASCADE, -- Null for personal vaults
    name VARCHAR(255) NOT NULL,
    vault_type VARCHAR(50) NOT NULL, -- PERSONAL, ORGANISATIONAL
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_vault_owner CHECK (
        (user_id IS NOT NULL AND org_id IS NULL) OR 
        (user_id IS NULL AND org_id IS NOT NULL)
    )
);

CREATE INDEX idx_vaults_user_id ON vaults(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_vaults_org_id ON vaults(org_id) WHERE org_id IS NOT NULL;
```

#### `vault_items`
**Description:** The core secrets stored in the vault (e.g., logins, notes). Data is heavily encrypted.

**PostgreSQL DDL:**
```sql
CREATE TABLE vault_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id), -- Creator/Owner
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'LOGIN',
    ciphertext TEXT NOT NULL,
    iv VARCHAR(255) NOT NULL,
    password_changed_at TIMESTAMP WITH TIME ZONE,
    favorite BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vault_items_vault_id ON vault_items(vault_id);
CREATE INDEX idx_vault_items_user_id ON vault_items(user_id);
CREATE INDEX idx_vault_items_deleted_at ON vault_items(deleted_at) WHERE deleted_at IS NULL;
```

#### `vault_item_versions`
**Description:** History of changes to vault items.

**PostgreSQL DDL:**
```sql
CREATE TABLE vault_item_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
    ciphertext TEXT NOT NULL,
    iv VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by_user_id UUID NOT NULL REFERENCES users(id)
);

CREATE INDEX idx_vault_item_versions_item_id ON vault_item_versions(item_id);
```

#### `folders`
**Description:** Organisational structure within a vault.

**PostgreSQL DDL:**
```sql
CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vault_id UUID NOT NULL REFERENCES vaults(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    name VARCHAR(255) NOT NULL, -- This should ideally be encrypted too, but kept plain for MVP searchability if acceptable
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_folders_vault_id ON folders(vault_id);
```

#### `attachments`
**Description:** Encrypted file attachments linked to vault items.

**PostgreSQL DDL:**
```sql
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id UUID NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
    storage_key VARCHAR(255) NOT NULL UNIQUE, -- S3/GCS object key
    ciphertext_size BIGINT NOT NULL,
    iv VARCHAR(255) NOT NULL,
    original_filename_encrypted TEXT NOT NULL,
    mime_type_encrypted TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_attachments_item_id ON attachments(item_id);
```

#### `tags` & `item_tags`
**Description:** System for categorizing items.

**PostgreSQL DDL:**
```sql
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE item_tags (
    item_id UUID NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, tag_id)
);
```

### Organisation & RBAC

#### `organisations`
**Description:** Top-level tenant container.

**PostgreSQL DDL:**
```sql
CREATE TABLE organisations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    plan VARCHAR(50) NOT NULL DEFAULT 'FREE',
    owner_user_id UUID NOT NULL REFERENCES users(id),
    encrypted_org_key_ciphertext TEXT NOT NULL,
    encrypted_org_key_iv VARCHAR(255) NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### `organisation_members`
**Description:** Users belonging to an organisation. They receive the org key encrypted with their public key.

**PostgreSQL DDL:**
```sql
CREATE TABLE organisation_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID, -- References roles table
    encrypted_org_key_for_user TEXT, -- Org key encrypted with user's public key
    status VARCHAR(50) NOT NULL DEFAULT 'INVITED', -- INVITED, ACTIVE, SUSPENDED
    invited_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    joined_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(org_id, user_id)
);
```

#### `groups` & `group_members`
**Description:** Logical grouping of users within an organisation for access control.

**PostgreSQL DDL:**
```sql
CREATE TABLE groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE group_members (
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    added_by_user_id UUID REFERENCES users(id),
    PRIMARY KEY (group_id, user_id)
);
```

#### `collections` & `collection_members` & `collection_groups`
**Description:** Shared vaults within an organisation.

**PostgreSQL DDL:**
```sql
CREATE TABLE collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    encrypted_collection_key TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE collection_members (
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_level VARCHAR(50) NOT NULL, -- READ, WRITE, MANAGE
    granted_by UUID REFERENCES users(id),
    granted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (collection_id, user_id)
);

CREATE TABLE collection_groups (
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    permission_level VARCHAR(50) NOT NULL, -- READ, WRITE, MANAGE
    PRIMARY KEY (collection_id, group_id)
);
```

#### `roles` & `permissions`
**Description:** RBAC definitions.

**PostgreSQL DDL:**
```sql
CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organisations(id) ON DELETE CASCADE, -- NULL means system role
    name VARCHAR(255) NOT NULL,
    description TEXT,
    is_system_role BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    resource_type VARCHAR(100) NOT NULL, -- e.g., 'vault', 'user', 'billing'
    action VARCHAR(100) NOT NULL, -- e.g., 'read', 'write', 'delete'
    effect VARCHAR(50) NOT NULL DEFAULT 'ALLOW' -- ALLOW, DENY
);
```

### Audit & Security

#### `audit_events`
**Description:** Append-only log of all significant actions. Features a sequence and cryptographic hash chaining to detect tampering.

**PostgreSQL DDL:**
```sql
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sequence SERIAL NOT NULL, -- Added for ordered hashing and logical progression
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    org_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
    event_type VARCHAR(100) NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}',
    prev_hash VARCHAR(255),
    hash VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_events_org_id ON audit_events(org_id);
CREATE INDEX idx_audit_events_user_id ON audit_events(user_id);
CREATE INDEX idx_audit_events_created_at ON audit_events(created_at);
```

#### `security_events`
**Description:** Specialized log for security alerts (e.g., failed logins, impossible travel).

**PostgreSQL DDL:**
```sql
CREATE TABLE security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL, -- LOW, MEDIUM, HIGH, CRITICAL
    details JSONB NOT NULL DEFAULT '{}',
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_security_events_user_id ON security_events(user_id);
CREATE INDEX idx_security_events_severity ON security_events(severity) WHERE resolved_at IS NULL;
```

### Access Management

#### `emergency_access`
**Description:** Allows a user to grant emergency access to their vault to a trusted contact.

**PostgreSQL DDL:**
```sql
CREATE TABLE emergency_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grantor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    grantee_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    access_type VARCHAR(50) NOT NULL, -- VIEW, TAKEOVER
    approval_delay_hours INTEGER NOT NULL DEFAULT 48,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING', -- PENDING, APPROVED, REJECTED, ACTIVE
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    approved_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(grantor_user_id, grantee_user_id)
);
```

#### `access_requests`
**Description:** Requests to access specific collections or items.

**PostgreSQL DDL:**
```sql
CREATE TABLE access_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    reason TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

#### `sharing_requests`
**Description:** External or internal sharing of specific items.

**PostgreSQL DDL:**
```sql
CREATE TABLE sharing_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_user_id_or_email VARCHAR(255) NOT NULL,
    item_id UUID NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
    encrypted_item_key TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### Secrets Management (Phase 6)

#### `secret_projects`, `secrets`, `secret_versions`
**Description:** Infrastructure secrets management (like .env files, API keys).

**PostgreSQL DDL:**
```sql
CREATE TABLE secret_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(org_id, slug)
);

CREATE TABLE secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES secret_projects(id) ON DELETE CASCADE,
    name_encrypted TEXT NOT NULL,
    value_ciphertext TEXT NOT NULL,
    iv VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE secret_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secret_id UUID NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
    value_ciphertext TEXT NOT NULL,
    iv VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id)
);
```

---

## 4. Data Classification Matrix

| Table | Column | Classification | Encrypted? | Indexed? | PII? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `users` | `id` | PUBLIC | No | Yes (PK) | No |
| `users` | `email_hash` | INTERNAL | No (Hashed) | Yes | Indirect |
| `users` | `email_encrypted` | CONFIDENTIAL | Yes | No | Yes |
| `users` | `auth_hash` | CONFIDENTIAL | No (Hashed) | No | No |
| `users` | `encrypted_vault_key_ciphertext` | ENCRYPTED | Yes | No | No |
| `vault_items` | `ciphertext` | ENCRYPTED | Yes | No | No |
| `audit_events`| `ip_address` | INTERNAL | No | No | Yes |
| `audit_events`| `metadata` | INTERNAL | No | No | Varies |
*(Note: Full matrix mapped based on strict zero-knowledge principles. No plaintext PII should reside in unencrypted columns except non-reversible hashes for lookup).*

---

## 5. Index Strategy

1.  **Foreign Keys:** All foreign keys are indexed. PostgreSQL does not automatically index FKs, so explicitly creating them (e.g., `idx_vault_items_vault_id`) is required to prevent full table scans during cascading deletes and join operations.
2.  **Lookup Hashes:** `users.email_hash` is indexed for fast sign-in lookups. Cardinality is high (1:1 with users).
3.  **Temporal Queries:** `audit_events.created_at` and `sessions.expires_at` are indexed to facilitate fast cleanup and time-range reporting.
4.  **Partial Indexes:** Used for stateful queries, e.g., `CREATE INDEX idx_vault_items_deleted_at ON vault_items(deleted_at) WHERE deleted_at IS NULL`. This optimizes queries fetching active items, keeping the index small as the "Trash" grows.

---

## 6. Partitioning & Archiving Strategy

For high-volume tables (`audit_events`, `security_events`):
- **Partitioning:** Implement declarative range partitioning by month on the `created_at` column.
    ```sql
    -- Example for future implementation
    CREATE TABLE audit_events (...) PARTITION BY RANGE (created_at);
    CREATE TABLE audit_events_y2026m08 PARTITION OF audit_events FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
    ```
- **Archiving Policy:** Partitions older than 12 months are exported to cold storage (e.g., AWS S3 Glacier) as Parquet files and dropped from the active PostgreSQL database.
- **Regulatory Compliance:** Hashes must be computed continuously across partition boundaries to maintain the tamper-evident chain.

---

## 7. Migration Strategy

To evolve from the MVP schema to this full schema:
1.  **Non-Breaking Additions:** Add new tables (`organisations`, `roles`, etc.) which do not affect existing MVP code.
2.  **Column Additions:** Add new columns to existing tables as nullable first.
3.  **Data Backfill:** Backfill data (e.g., generating `sequence` values for existing `audit_events` ensuring they follow chronological order). Compute `prev_hash` and `hash` retroactively for the MVP audit events.
4.  **Constraint Enforcement:** Once backfilled, alter columns to apply `NOT NULL` constraints.
5.  **Downtime Migration:** Minimal downtime is required when transitioning foreign key ownership from `users` to `organisations` for vault items during the enterprise rollout.

---

## 8. Backup & Recovery

- **RPO (Recovery Point Objective):** 5 minutes. Achieved via continuous WAL (Write-Ahead Logging) archiving to S3.
- **RTO (Recovery Time Objective):** 1 hour. Automated restore procedures using infrastructure-as-code (e.g., Terraform + pgBackRest).
- **Point-in-Time Recovery (PITR):** Maintained for the last 30 days to protect against mass accidental data corruption or ransomware.
- **Security:** All backups must be encrypted at rest using a KMS key distinct from the application's data keys. Backup storage must be immutable (WORM) for compliance.
