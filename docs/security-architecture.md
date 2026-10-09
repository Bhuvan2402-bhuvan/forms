# FormCraft Studio — Security Architecture & Threat Model

## 1. Security Overview & Trust Boundaries

FormCraft Studio is engineered with defense-in-depth principles across transport, authentication, application, database, and storage layers.

```
+--------------------------------------------------------------------------------+
| ZONE 1: PUBLIC INTERNET                                                        |
| - External Respondents (Filling Out Forms)                                      |
| - Administrators / Form Creators                                               |
+---------------------------------------+----------------------------------------+
                                        | TLS 1.3 / HTTPS
                                        v
+---------------------------------------+----------------------------------------+
| ZONE 2: EDGE PROXY (Cloudflare Tunnel)                                         |
| - Edge TLS Termination, DDoS Mitigation, WAF                                    |
| - Header Injection (X-Forwarded-Proto, X-Forwarded-Host)                       |
+---------------------------------------+----------------------------------------+
                                        | HTTP Internal Proxy (Port 3005)
                                        v
+---------------------------------------+----------------------------------------+
| ZONE 3: DOCKER CONTAINER APPLICATION LAYER (formcraft_app)                    |
| - Non-Root User Execution (`node`)                                             |
| - Strict CSP, HSTS, X-Content-Type-Options, Frame-Ancestors                     |
| - In-Memory Sliding-Window IP Rate Limiter                                     |
| - Request Size Guard (Max 5MB Body, 15MB Uploads)                              |
| - HMAC-SHA256 Session Verification & PBKDF2 Password Authentication            |
| - AES-256-GCM Field-Level Authenticated Encryption Engine                       |
| - Append-Only Security Audit Logging (`data/audit.log`)                        |
+---------------------------------------+----------------------------------------+
                                        | Private Docker Network (`formcraft_network`)
                                        v
+---------------------------------------+----------------------------------------+
| ZONE 4: STORAGE & DATABASE LAYER (formcraft_postgres & data/)                 |
| - Self-Hosted PostgreSQL 16 (Port 5432 Unexposed)                              |
| - Parameterized SQL Queries Exclusively (Zero SQLi)                            |
| - Private Encrypted Filesystem Storage (`data/uploads/`)                       |
| - LUKS Encrypted Host Volume Storage (Host OS)                                 |
+--------------------------------------------------------------------------------+
```

---

## 2. Authentication & Session Architecture

### Administrator / Creator Authentication
- **Password Hashing**: Passwords are saved with 100,000 rounds of PBKDF2 with SHA-512 and a cryptographically random 16-byte salt per credential.
- **Session Tokens**: Administrative sessions use HMAC-SHA256 signed tokens (`${payload_base64url}.${signature}`).
- **Token Verification**: Tokens are validated using `crypto.timingSafeEqual()` to eliminate timing attack vectors.
- **Expiration**: Session tokens expire after 24 hours.
- **Brute-Force Rate Limiting**: The `/api/admin-auth` endpoint restricts requests to 10 per minute per IP address. Exceeded limits return HTTP 429.

### Respondent Access Model
- Public respondents do not require accounts to access published forms.
- Form accessibility is controlled on the server:
  - If `acceptingResponses: false`, access is denied (HTTP 403) with the creator's custom closed message.
  - If `hasEndTime: true` and `endDateTime` has elapsed, access is denied (HTTP 403) with a deadline expiration notice.
  - Submissions are restricted to 40 per minute per IP.

---

## 3. Cryptography & Encryption at Rest

### AES-256-GCM Field-Level Authenticated Encryption
Sensitive form submission data (digital signatures, personal details, file references) is encrypted before storage:
- **Algorithm**: `AES-256-GCM` (Galois/Counter Mode).
- **Nonce/IV**: Cryptographically random 96-bit (12-byte) initialization vector generated per field.
- **Integrity & Authentication**: 128-bit authentication tag (`getAuthTag()`) ensures tampered or corrupted ciphertext fails decryption.
- **Ciphertext Format**: `enc:v1:<base64(iv)>:<base64(auth_tag)>:<base64(ciphertext)>`.
- **Key Derivation**: 256-bit encryption key derived from `ADMIN_SECRET` using PBKDF2 (or explicitly configured via `ENCRYPTION_KEY`).

### Storage at Rest
- **Database Volumes**: The persistent PostgreSQL directory on the host can be placed on an encrypted partition (LUKS on Ubuntu Server).
- **File Uploads**: Placed outside the web root in `data/uploads/` with randomized UUID file names and delivered with `Content-Disposition: attachment; filename="..."` to prevent active script execution.

---

## 4. Encryption in Transit & Security Headers

Every HTTP response includes strict defense-in-depth headers:
- `Content-Security-Policy`: Restricts script, style, font, and frame ancestors.
- `X-Content-Type-Options: nosniff`: Prevents MIME-confusion attacks.
- `X-Frame-Options: SAMEORIGIN`: Prevents unauthorized clickjacking.
- `Referrer-Policy: strict-origin-when-cross-origin`: Restricts referrer leaking.
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`: Disables unwanted browser features.
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`: Enforces HTTPS when accessed over TLS.

---

## 5. Security Audit Logging

Security-critical actions are recorded in `data/audit.log` as JSON Lines:
- `LOGIN_SUCCESS`, `LOGIN_FAILURE`, `RATE_LIMIT_EXCEEDED`
- `PASSWORD_CHANGED`, `PASSWORD_CHANGE_FAILED`
- `FORM_SAVED`, `FORM_DELETED`
- `RESPONSE_SUBMITTED`, `SUBMISSIONS_ACCESSED`
- `FILE_UPLOADED`

*Note: Passwords, raw credentials, and sensitive plaintext answers are never written to audit logs.*
