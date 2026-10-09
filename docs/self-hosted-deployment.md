# FormCraft Studio — Self-Hosted Production Deployment Guide

## 1. Architecture Overview

FormCraft Studio is an enterprise-grade, Google Forms–like form creation, respondent collection, and analytics platform.

### Architecture Stack
- **Frontend**: Vanilla ES6 Modules + Modern CSS Design System (Custom properties, dynamic theming, multi-step progress, digital signatures, responsive viewport preview).
- **Backend API Server**: Node.js HTTP Application Server with built-in REST routing, HMAC authentication, server-side data validation, and clean SPA deep link routing (`/f/:id`, `/admin`, etc.).
- **Database Engine**: Self-Hosted PostgreSQL 16 (running via Docker Compose with private bridge networking and persistent volumes) with layered local JSON fallback.
- **Reverse Proxy & TLS**: Cloudflare Tunnel (or Nginx / Caddy) terminating HTTPS at the edge and proxying traffic internally to port 3005.

```
                    ┌─────────────────────────┐
                    │    Internet / Users     │
                    └────────────┬────────────┘
                                 │ HTTPS (443)
                    ┌────────────▼────────────┐
                    │   Cloudflare Tunnel     │
                    │   (Edge TLS Proxy)      │
                    └────────────┬────────────┘
                                 │ HTTP (3005)
 ┌───────────────────────────────┼───────────────────────────────┐
 │ Ubuntu Server (Docker Host)   │                               │
 │                               ▼                               │
 │                  ┌─────────────────────────┐                  │
 │                  │   formcraft_app         │                  │
 │                  │   (Node.js Container)   │                  │
 │                  └────────────┬────────────┘                  │
 │                               │ Internal Docker Network       │
 │                               ▼ (Port 5432 - Not Public)      │
 │                  ┌─────────────────────────┐                  │
 │                  │   formcraft_postgres    │                  │
 │                  │   (PostgreSQL 16)       │                  │
 │                  └────────────┬────────────┘                  │
 │                               ▼                               │
 │                  ┌─────────────────────────┐                  │
 │                  │ Host Storage Volumes    │                  │
 │                  │ (/var/lib/formcraft/...)│                  │
 │                  └─────────────────────────┘                  │
 └───────────────────────────────────────────────────────────────┘
```

---

## 2. Prerequisites on Ubuntu Server

1. **Ubuntu Server** (20.04 LTS, 22.04 LTS, or 24.04 LTS).
2. **Docker Engine & Docker Compose Plugin**:
   ```bash
   sudo apt-get update
   sudo apt-get install -y ca-certificates curl gnupg
   sudo install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   sudo chmod a+r /etc/apt/keyrings/docker.gpg

   echo \
     "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
     $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
     sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

   sudo apt-get update
   sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```
3. **Cloudflare Tunnel (`cloudflared`)** installed if routing public traffic through Cloudflare.

---

## 3. Environment Variable Reference

Create your production configuration by copying `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `APP_URL` | **Yes** | `http://localhost:3005` | Canonical public origin (e.g. `https://forms.yourdomain.com`). Used for all generated shareable links and redirects. |
| `PORT` | No | `3005` | Internal host port for the Node.js application server. |
| `NODE_ENV` | No | `production` | Application runtime environment. |
| `POSTGRES_DB` | **Yes** | `formcraft_db` | PostgreSQL database name. |
| `POSTGRES_USER` | **Yes** | `formcraft` | PostgreSQL master username. |
| `POSTGRES_PASSWORD` | **Yes** | - | Strong password for PostgreSQL database. |
| `APP_POSTGRES_DATA_PATH` | No | `./postgres_data` | Persistent host directory for PostgreSQL storage (e.g., `/var/lib/formcraft/postgres_data`). |
| `APP_DATA_PATH` | No | `./data` | Persistent host directory for local backups & logs (e.g., `/var/lib/formcraft/data`). |
| `ADMIN_PASSWORD` | **Yes** | `admin123` | Password required to unlock Studio Builder & Admin Dashboard. |
| `ADMIN_SECRET` | **Yes** | - | 64-character secret key used for HMAC session tokens. |

---

## 4. Quick Start Deployment on Ubuntu

### Step 1: Clone or Copy Repository to Server
```bash
sudo mkdir -p /opt/formcraft
sudo chown -R $USER:$USER /opt/formcraft
cd /opt/formcraft
# Copy or git pull repository files here
```

### Step 2: Configure Environment
```bash
cp .env.example .env
nano .env
```
Generate strong random keys for `POSTGRES_PASSWORD` and `ADMIN_SECRET`:
```bash
openssl rand -hex 32
```

### Step 3: Start the Docker Stack
```bash
docker compose up -d --build
```

### Step 4: Verify Health and Logs
```bash
docker compose ps
docker compose logs -f app
```
You should see:
```text
Forms by Varunya tech server running at http://0.0.0.0:3005
Self-hosted PostgreSQL tables verified & ready.
Public canonical origin: https://forms.yourdomain.com
```

---

## 5. Migrating Data from Existing Supabase / Local Storage

If you have existing forms or submissions in Supabase or local JSON files, run the automated migration script:

```bash
# Run migration inside the application container
docker compose exec app node scripts/migrate-to-postgres.js
```
The script safely reads records, creates the schema, deduplicates IDs, preserves submission timestamps and answers, and verifies table row counts.

---

## 6. Configuring Cloudflare Tunnel for Public Access

Cloudflare Tunnel provides free, zero-trust, DDoS-protected HTTPS routing without exposing any firewall ports or opening port 5432 to the public internet.

### Option A: Using the Cloudflare Zero Trust Web Dashboard (Recommended)
1. In the **Cloudflare Zero Trust Dashboard**, navigate to **Networks** → **Tunnels**.
2. Click **Create a Tunnel** (named e.g. `formcraft-production`).
3. Follow the instructions to install `cloudflared` on your Ubuntu server.
4. Under **Public Hostnames**, add:
   - **Subdomain / Domain**: `forms` . `yourdomain.com`
   - **Type**: `HTTP`
   - **URL**: `localhost:3005` (or `127.0.0.1:3005`)
5. Save the hostname.
6. In your `/opt/formcraft/.env` file, update:
   ```env
   APP_URL=https://forms.yourdomain.com
   ```
7. Restart the app container:
   ```bash
   docker compose restart app
   ```

### Option B: Using CLI `cloudflared`
```bash
# 1. Login to Cloudflare
cloudflared tunnel login

# 2. Create Tunnel
cloudflared tunnel create formcraft-tunnel

# 3. Route DNS
cloudflared tunnel route dns formcraft-tunnel forms.yourdomain.com

# 4. In ~/.cloudflared/config.yml:
tunnel: <TUNNEL_UUID>
credentials-file: /root/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: forms.yourdomain.com
    service: http://localhost:3005
  - service: http_status:404

# 5. Start Tunnel Service
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

---

## 7. Dynamic Form Links & Routing Reference

### Form Creation & ID Generation
- Every form is assigned a collision-resistant unique identifier (e.g. `form-1741528392819` or custom identifier).
- Unique identifiers are indexed in PostgreSQL (`PRIMARY KEY` on `forms.id`).

### Shareable Public URLs
- URLs are formatted as `${APP_URL}/f/${formId}`.
- When an external respondent opens `/f/:id`:
  1. The server serves the responsive standalone form respondent view without requiring creator credentials.
  2. The frontend queries `/api/forms?id=:id` and loads the exact form definition instantly.
  3. If the form deadline has expired or `acceptingResponses` is toggled off, a clean Google Forms–style closed message is rendered.
  4. If the form ID is invalid or deleted, a helpful "Form Not Found" card is displayed (preventing any fallback to default templates).

---

## 8. Backup and Restore Procedures

### Automated Daily Backups
The backup script creates timestamped, compressed SQL archives in `./backups/`:

```bash
chmod +x scripts/backup.sh scripts/restore.sh
./scripts/backup.sh
```

To schedule automatic daily backups at 3:00 AM via cron:
```bash
crontab -e
```
Add the following line:
```cron
0 3 * * * cd /opt/formcraft && ./scripts/backup.sh >> /var/log/formcraft_backup.log 2>&1
```

### Database Restore
To restore from a backup archive:
```bash
./scripts/restore.sh ./backups/formcraft_backup_20261009_120000.sql.gz
```

---

## 9. Updating the Application

To deploy future updates safely without downtime or data loss:

```bash
cd /opt/formcraft
# 1. Create a precautionary backup
./scripts/backup.sh

# 2. Pull the latest code
git pull origin main

# 3. Rebuild and restart the container
docker compose up -d --build app

# 4. Run automated test suite
docker compose exec app npm test
```

---

## 10. Troubleshooting

### Problem: Dynamic form link returns 404 or Form Not Found
- Verify the form exists in PostgreSQL:
  ```bash
  docker compose exec postgres psql -U formcraft -d formcraft_db -c "SELECT id, title, updated_at FROM forms;"
  ```
- Check server logs:
  ```bash
  docker compose logs --tail=100 app
  ```

### Problem: Links show `localhost:3005` instead of public domain
- Ensure `APP_URL` in `.env` is set to `https://forms.yourdomain.com`.
- Restart the app container: `docker compose restart app`.

### Problem: Database connection error on startup
- Check PostgreSQL container health:
  ```bash
  docker compose ps
  docker compose logs postgres
  ```
- Verify `POSTGRES_PASSWORD` matches in `.env`.
