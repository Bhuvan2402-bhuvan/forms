#!/usr/bin/env bash

# ============================================================================
# FormCraft Studio - PostgreSQL Database Restore Script
# Restores database from a compressed .sql.gz backup file
# ============================================================================

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz>"
  echo "Example: $0 ./backups/formcraft_backup_20261009_120000.sql.gz"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

CONTAINER_NAME="${CONTAINER_NAME:-formcraft_postgres}"
POSTGRES_USER="${POSTGRES_USER:-formcraft}"
POSTGRES_DB="${POSTGRES_DB:-formcraft_db}"

echo "======================================================================"
echo "WARNING: This will restore database '${POSTGRES_DB}' from '${BACKUP_FILE}'."
echo "Existing data will be overwritten."
echo "======================================================================"
read -p "Are you sure you want to proceed? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
  echo "Restore cancelled by user."
  exit 1
fi

echo "Restoring database..."
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  gunzip -c "${BACKUP_FILE}" | docker exec -i "${CONTAINER_NAME}" psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
else
  gunzip -c "${BACKUP_FILE}" | psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"
fi

echo "Database restore completed successfully from ${BACKUP_FILE}."
