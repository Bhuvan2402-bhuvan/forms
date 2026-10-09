#!/usr/bin/env node

/**
 * ============================================================================
 * FormCraft Studio - Safe Data Migration Script
 * Migrates data from Local JSON Storage into Self-Hosted PostgreSQL 16
 * ============================================================================
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// Zero-dependency .env loader
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...vals] = trimmed.split('=');
        if (key && vals.length > 0) {
          const val = vals.join('=').trim().replace(/^["']|["']$/g, '');
          if (!process.env[key.trim()]) {
            process.env[key.trim()] = val;
          }
        }
      }
    });
  }
}
loadEnv();

const DATABASE_URL = process.env.DATABASE_URL || '';
const PGHOST = process.env.PGHOST || process.env.POSTGRES_HOST || 'localhost';
const PGPORT = parseInt(process.env.PGPORT || process.env.POSTGRES_PORT || '5432', 10);
const PGUSER = process.env.PGUSER || process.env.POSTGRES_USER || 'formcraft';
const PGPASSWORD = process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD || '';
const PGDATABASE = process.env.PGDATABASE || process.env.POSTGRES_DB || 'formcraft_db';


const DATA_DIR = path.join(__dirname, '..', 'data');
const FORMS_FILE = path.join(DATA_DIR, 'forms.json');
const SUBS_FILE = path.join(DATA_DIR, 'submissions.json');
const CRED_FILE = path.join(DATA_DIR, 'admin_credential.json');

async function runMigration() {
  console.log('--- FormCraft Studio Database Migration Tool ---');

  const poolConfig = DATABASE_URL
    ? { connectionString: DATABASE_URL }
    : { host: PGHOST, port: PGPORT, user: PGUSER, password: PGPASSWORD, database: PGDATABASE };

  console.log(`Target Database: ${DATABASE_URL ? '[DATABASE_URL provided]' : `${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}`}`);
  const pool = new Pool(poolConfig);

  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL successfully.');

    // 1. Initialize schema
    console.log('Verifying PostgreSQL tables...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS forms (
          id VARCHAR(128) PRIMARY KEY,
          title VARCHAR(512) NOT NULL,
          description TEXT DEFAULT '',
          category VARCHAR(128) DEFAULT 'Custom',
          badge VARCHAR(128) DEFAULT 'Single Page Form',
          is_multi_step BOOLEAN DEFAULT FALSE,
          theme JSONB DEFAULT '{}'::jsonb,
          settings JSONB DEFAULT '{}'::jsonb,
          steps JSONB DEFAULT '[]'::jsonb,
          fields JSONB DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_forms_updated_at ON forms(updated_at DESC);

      CREATE TABLE IF NOT EXISTS submissions (
          id VARCHAR(128) PRIMARY KEY,
          form_id VARCHAR(128) NOT NULL,
          submitted_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          duration_seconds INTEGER DEFAULT 60,
          data JSONB DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT fk_submissions_form FOREIGN KEY (form_id) REFERENCES forms(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_submissions_form_id ON submissions(form_id);

      CREATE TABLE IF NOT EXISTS admin_auth (
          id VARCHAR(64) PRIMARY KEY DEFAULT 'admin_credential',
          password_hash VARCHAR(512) NOT NULL,
          salt VARCHAR(128) NOT NULL,
          updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);

    // 2. Collect forms from local JSON storage
    const formsToMigrate = new Map();

    if (fs.existsSync(FORMS_FILE)) {
      try {
        const localForms = JSON.parse(fs.readFileSync(FORMS_FILE, 'utf8'));
        if (Array.isArray(localForms)) {
          localForms.forEach(f => {
            if (f.id && !f.id.startsWith('__system_')) formsToMigrate.set(f.id, f);
          });
          console.log(`Loaded ${localForms.length} forms from local JSON.`);
        }
      } catch (e) {
        console.warn('Could not parse local forms.json:', e.message);
      }
    }


    // 3. Insert / Upsert Forms into PostgreSQL
    let formsInserted = 0;
    for (const [id, f] of formsToMigrate.entries()) {
      await client.query(`
        INSERT INTO forms (id, title, description, category, badge, is_multi_step, theme, settings, steps, fields, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          description = EXCLUDED.description,
          category = EXCLUDED.category,
          badge = EXCLUDED.badge,
          is_multi_step = EXCLUDED.is_multi_step,
          theme = EXCLUDED.theme,
          settings = EXCLUDED.settings,
          steps = EXCLUDED.steps,
          fields = EXCLUDED.fields,
          updated_at = CURRENT_TIMESTAMP
      `, [
        id,
        f.title || 'Untitled Form',
        f.description || '',
        f.category || 'Custom',
        f.badge || 'Single Page Form',
        !!f.isMultiStep,
        JSON.stringify(f.theme || {}),
        JSON.stringify(f.settings || {}),
        JSON.stringify(f.steps || []),
        JSON.stringify(f.fields || [])
      ]);
      formsInserted++;
    }
    console.log(`Successfully migrated ${formsInserted} forms into PostgreSQL.`);

    // 4. Collect and insert submissions
    const subsToMigrate = new Map();

    if (fs.existsSync(SUBS_FILE)) {
      try {
        const localSubs = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
        if (Array.isArray(localSubs)) {
          localSubs.forEach(s => {
            if (s.id && formsToMigrate.has(s.form_id || s.formId)) {
              subsToMigrate.set(s.id, s);
            }
          });
          console.log(`Loaded ${localSubs.length} submissions from local JSON.`);
        }
      } catch (e) {
        console.warn('Could not parse local submissions.json:', e.message);
      }
    }

    let subsInserted = 0;
    for (const [id, s] of subsToMigrate.entries()) {
      const formId = s.form_id || s.formId;
      const submittedAt = s.submitted_at || s.submittedAt || new Date().toISOString();
      const durationSeconds = s.duration_seconds || s.durationSeconds || 60;
      const data = s.data || {};

      await client.query(`
        INSERT INTO submissions (id, form_id, submitted_at, duration_seconds, data)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO NOTHING
      `, [id, formId, submittedAt, durationSeconds, JSON.stringify(data)]);
      subsInserted++;
    }
    console.log(`Successfully migrated ${subsInserted} submissions into PostgreSQL.`);

    // 5. Migrate Admin Credentials
    if (fs.existsSync(CRED_FILE)) {
      try {
        const cred = JSON.parse(fs.readFileSync(CRED_FILE, 'utf8'));
        if (cred.password_hash && cred.salt) {
          await client.query(`
            INSERT INTO admin_auth (id, password_hash, salt, updated_at)
            VALUES ('admin_credential', $1, $2, CURRENT_TIMESTAMP)
            ON CONFLICT (id) DO UPDATE SET password_hash = $1, salt = $2, updated_at = CURRENT_TIMESTAMP
          `, [cred.password_hash, cred.salt]);
          console.log('Successfully migrated admin credentials to PostgreSQL.');
        }
      } catch {}
    }

    // 6. Verify row counts
    const formsCount = await client.query('SELECT COUNT(*) FROM forms');
    const subsCount = await client.query('SELECT COUNT(*) FROM submissions');
    console.log(`--- Migration Complete ---`);
    console.log(`PostgreSQL Table Counts:`);
    console.log(` - Forms: ${formsCount.rows[0].count}`);
    console.log(` - Submissions: ${subsCount.rows[0].count}`);

    client.release();
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
