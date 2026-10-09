# FormCraft Studio — Security Incident Response & Credential Rotation

## 1. Incident Response Workflow

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  1. Identification│ ──> │  2. Containment  │ ──> │  3. Remediation  │ ──> │ 4. Post-Incident │
│  & Threat Triage │     │  & Isolation     │     │  & Credential Rot│     │    Review        │
└──────────────────┘     └──────────────────┘     └──────────────────┘     └──────────────────┘
```

1. **Identification**: Review `data/audit.log` and container logs (`docker compose logs --tail=500 app`).
2. **Containment**: If an IP is abusing endpoints or attempting brute-force attacks:
   - Apply Cloudflare WAF block rule or UFW host block:
     ```bash
     sudo ufw deny from <MALICIOUS_IP>
     ```
3. **Remediation**: Rotate compromised keys, passwords, and session tokens.
4. **Post-Incident**: Document the attack vector and implement additional rate-limiting or firewall filters.

---

## 2. Emergency Credential Rotation Guide

### Rotating the Administrator Password
1. Change `ADMIN_PASSWORD` in `.env`.
2. Generate a new `ADMIN_SECRET`:
   ```bash
   openssl rand -hex 32
   ```
   Updating `ADMIN_SECRET` immediately invalidates all currently active session tokens across all browsers.
3. Restart the application:
   ```bash
   docker compose restart app
   ```

### Rotating the PostgreSQL Database Password
1. Connect to PostgreSQL and update the user password:
   ```bash
   docker compose exec postgres psql -U formcraft -d formcraft_db -c "
     ALTER USER formcraft WITH PASSWORD 'new_secure_password_here';
   "
   ```
2. Update `POSTGRES_PASSWORD` in `.env`.
3. Restart the application:
   ```bash
   docker compose restart app
   ```

### Rotating Cloudflare Tunnel Tokens
1. In the **Cloudflare Zero Trust Dashboard**, navigate to **Tunnels**.
2. Select your tunnel, click **Configure** → **Rotate Token**.
3. Restart the `cloudflared` service on the Ubuntu server.

---

## 3. Investigating Security Audit Logs

The append-only audit log is stored at `data/audit.log`.

```bash
# View recent failed login attempts
grep "LOGIN_FAILURE" data/audit.log | tail -n 50

# View rate-limit triggers
grep "RATE_LIMIT_EXCEEDED" data/audit.log | tail -n 50

# View response submission volume
grep "RESPONSE_SUBMITTED" data/audit.log | wc -l
```
