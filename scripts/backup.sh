#!/usr/bin/env bash

# ============================================================================
# FormCraft Studio - Automated PostgreSQL Database Backup Script
# Creates a compressed, timestamped SQL backup of the database
# ============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
mkdir -p "${BACKUP_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/formcraft_backup_${TIMESTAMP}.sql.gz"

CONTAINER_NAME="${CONTAINER_NAME:-formcraft_postgres}"
POSTGRES_USER="${POSTGRES_USER:-formcraft}"
POSTGRES_DB="${POSTGRES_DB:-formcraft_db}"

echo "Starting FormCraft Studio PostgreSQL Backup..."
echo "Timestamp: ${TIMESTAMP}"
echo "Target: ${BACKUP_FILE}"

if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "Backing up from running Docker container [${CONTAINER_NAME}]..."
  docker exec -t "${CONTAINER_NAME}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists | gzip > "${BACKUP_FILE}"
else
  echo "Docker container not running. Attempting local pg_dump..."
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists | gzip > "${BACKUP_FILE}"
fi

FILESIZE=$(ls -lh "${BACKUP_FILE}" | awk '{print $5}')
echo "Backup successfully completed: ${BACKUP_FILE} (${FILESIZE})"

# Retain last 14 backups, remove older
find "${BACKUP_DIR}" -name "formcraft_backup_*.sql.gz" -mtime +14 -exec rm {} \;
echo "Cleaned up backups older than 14 days."
