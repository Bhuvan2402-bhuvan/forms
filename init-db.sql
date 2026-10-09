-- ============================================================================
-- FormCraft Studio - Self-Hosted PostgreSQL Database Schema
-- Compatible with PostgreSQL 14, 15, and 16
-- ============================================================================

-- 1. Create Forms Table
CREATE TABLE IF NOT EXISTS forms (
    id VARCHAR(128) PRIMARY KEY,
    title VARCHAR(512) NOT NULL,
    description TEXT DEFAULT '',
    category VARCHAR(128) DEFAULT 'Custom',
    badge VARCHAR(128) DEFAULT 'Single Page Form',
    is_multi_step BOOLEAN DEFAULT FALSE,
    theme JSONB DEFAULT '{"accentColor": "#6366f1", "borderRadius": "16px", "fontFamily": "\x27Plus Jakarta Sans\x27, sans-serif"}'::jsonb,
    settings JSONB DEFAULT '{"acceptingResponses": true, "hasEndTime": false, "endDateTime": null, "closedMessage": "This form is no longer accepting responses. The deadline for submission has passed."}'::jsonb,
    steps JSONB DEFAULT '[]'::jsonb,
    fields JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forms_updated_at ON forms(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_forms_category ON forms(category);

-- 2. Create Submissions Table
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
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions(submitted_at DESC);

-- 3. Create Admin Credentials Table
CREATE TABLE IF NOT EXISTS admin_auth (
    id VARCHAR(64) PRIMARY KEY DEFAULT 'admin_credential',
    password_hash VARCHAR(512) NOT NULL,
    salt VARCHAR(128) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- 4. Function & Trigger for Auto-Updating updated_at
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_forms_updated_at ON forms;
CREATE TRIGGER trg_forms_updated_at
BEFORE UPDATE ON forms
FOR EACH ROW
EXECUTE FUNCTION update_timestamp();
