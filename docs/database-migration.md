# FormCraft Studio — Database Migration Guide

## 1. Migration Overview

This document details the procedures for migrating form schemas, definitions, submission data, and credentials from Supabase / Vercel cloud environments to self-hosted PostgreSQL 16.

---

## 2. Schema Comparison & Mapping

| Entity | Supabase PostgreSQL Type | Self-Hosted PostgreSQL 16 Type | Description |
| :--- | :--- | :--- | :--- |
| `forms.id` | `TEXT PRIMARY KEY` | `VARCHAR(128) PRIMARY KEY` | Cryptographically unique form identifier. |
| `forms.title` | `TEXT NOT NULL` | `VARCHAR(512) NOT NULL` | Form display title. |
| `forms.description` | `TEXT` | `TEXT` | Form instructions or description. |
| `forms.category` | `TEXT` | `VARCHAR(128)` | Form classification. |
| `forms.is_multi_step` | `BOOLEAN` | `BOOLEAN` | Multi-step progress indicator. |
| `forms.theme` | `JSONB` | `JSONB` | Form visual theme & styling. |
| `forms.settings` | `JSONB` | `JSONB` | Responses switch, deadline, and closed message. |
| `forms.steps` | `JSONB` | `JSONB` | Ordered step sections. |
| `forms.fields` | `JSONB` | `JSONB` | Field questions schema. |
| `submissions.id` | `TEXT PRIMARY KEY` | `VARCHAR(128) PRIMARY KEY` | Unique submission identifier. |
| `submissions.form_id` | `TEXT` | `VARCHAR(128) REFERENCES forms(id)` | Foreign key reference with cascade delete. |
| `submissions.data` | `JSONB` | `JSONB` | Encrypted submission answers (`AES-256-GCM`). |
| `admin_auth` | `TABLE` | `TABLE` | PBKDF2 password hashes and salt. |

---

## 3. Running the Migration

The repository includes an automated migration utility ([scripts/migrate-to-postgres.js](file:///e:/forms/scripts/migrate-to-postgres.js)).

### Migration Steps

1. **Ensure PostgreSQL is running**:
   ```bash
   docker compose up -d postgres
   ```

2. **Set Environment Variables in `.env`**:
   ```env
   # Target Self-Hosted PostgreSQL
   DATABASE_URL=postgresql://formcraft:your_password@localhost:5432/formcraft_db
   
   # Source Supabase Credentials (if pulling from Cloud)
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_SECRET_KEY=your_supabase_service_role_key
   ```

3. **Execute Migration**:
   ```bash
   docker compose exec app npm run migrate
   ```

4. **Verify Table Counts & Data**:
   ```bash
   docker compose exec postgres psql -U formcraft -d formcraft_db -c "
     SELECT 'forms' AS table_name, count(*) FROM forms
     UNION ALL
     SELECT 'submissions', count(*) FROM submissions;
   "
   ```

---

## 4. Rollback Procedure

If you need to roll back to the previous state:
1. Revert environment variables to the previous configuration.
2. The original Supabase project and local JSON files remain untouched during migration.
3. If necessary, restore the database from backup:
   ```bash
   ./scripts/restore.sh ./backups/formcraft_backup_pre_migration.sql.gz
   ```
