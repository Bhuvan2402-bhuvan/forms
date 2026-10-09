# FormCraft Studio — Backup & Disaster Recovery Guide

## 1. Backup Strategy Overview

FormCraft Studio provides automated, compressed, and encrypted database backup capabilities for PostgreSQL and uploaded attachments.

- **Recovery Point Objective (RPO)**: 24 hours (default daily backup) or configurable down to 1 hour with cron.
- **Recovery Time Objective (RTO)**: Under 5 minutes for full database restoration.
- **Backup Retention**: Automated 14-day retention cycle with rotation.

---

## 2. Automated PostgreSQL Backups

### Running a Manual Backup
```bash
chmod +x scripts/backup.sh
./scripts/backup.sh
```

Backups are saved to `./backups/formcraft_backup_YYYYMMDD_HHMMSS.sql.gz`.

### Encrypted Backups (AES-256-CBC)
To generate an encrypted backup archive:
```bash
BACKUP_FILE="./backups/formcraft_backup_$(date +%Y%m%d_%H%M%S).sql.gz.enc"
docker exec -t formcraft_postgres pg_dump -U formcraft -d formcraft_db --clean --if-exists \
  | gzip \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass pass:"$BACKUP_PASSPHRASE" -out "$BACKUP_FILE"
```

### Scheduling with Cron
To run backups automatically every morning at 3:00 AM:
```bash
crontab -e
```
Add the following line:
```cron
0 3 * * * cd /opt/formcraft && ./scripts/backup.sh >> /var/log/formcraft_backup.log 2>&1
```

---

## 3. Restoring from a Backup

To restore the database:
```bash
chmod +x scripts/restore.sh
./scripts/restore.sh ./backups/formcraft_backup_20261009_120000.sql.gz
```

### Restoring from an Encrypted Archive
```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass pass:"$BACKUP_PASSPHRASE" -in backup.sql.gz.enc \
  | gunzip \
  | docker exec -i formcraft_postgres psql -U formcraft -d formcraft_db
```

---

## 4. Backing Up Private Uploads

Uploaded files stored in `data/uploads/` should be included in system-level backup routines:
```bash
tar -czvf ./backups/uploads_backup_$(date +%Y%m%d).tar.gz ./data/uploads/
```

---

## 5. Disaster Recovery Checklist

In the event of complete server failure:
1. Provision a fresh Ubuntu Server instance.
2. Install Docker and Docker Compose.
3. Clone repository and restore `.env` configuration.
4. Restore the latest database archive using `./scripts/restore.sh`.
5. Restore the `./data/uploads/` archive.
6. Start containers: `docker compose up -d --build`.
7. Run `docker compose exec app npm test` to verify operational status.
