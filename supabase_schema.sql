-- ============================================================================
-- FormCraft Studio - Supabase PostgreSQL Database Schema
-- Run this script in your Supabase SQL Editor: 
-- https://supabase.com/dashboard/project/brfhqgdvyqustbjndrex/sql
-- ============================================================================

-- 1. Create Forms & Applications Table
CREATE TABLE IF NOT EXISTS public.forms (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'Custom',
    badge TEXT DEFAULT 'Single Page Form',
    is_multi_step BOOLEAN DEFAULT FALSE,
    theme JSONB DEFAULT $${"accentColor": "#6366f1", "borderRadius": "16px", "fontFamily": "'Plus Jakarta Sans', sans-serif"}$$::jsonb,
    settings JSONB DEFAULT $${"acceptingResponses": true, "hasEndTime": false, "endDateTime": null, "closedMessage": "This form is no longer accepting responses. The deadline for submission has passed."}$$::jsonb,
    steps JSONB DEFAULT '[]'::jsonb,
    fields JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure settings column exists if table was already created
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'forms' 
        AND column_name = 'settings'
    ) THEN
        ALTER TABLE public.forms ADD COLUMN settings JSONB DEFAULT $${"acceptingResponses": true, "hasEndTime": false, "endDateTime": null, "closedMessage": "This form is no longer accepting responses. The deadline for submission has passed."}$$::jsonb;
    END IF;
END $$;

-- 2. Create Submissions Table
CREATE TABLE IF NOT EXISTS public.submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    submitted_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    duration_seconds INTEGER DEFAULT 60,
    data JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

-- 4. Policies for public access (FormCraft Studio client & responder access)
DROP POLICY IF EXISTS "Allow public read-write for forms" ON public.forms;
CREATE POLICY "Allow public read-write for forms"
    ON public.forms
    FOR ALL
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read-write for submissions" ON public.submissions;
CREATE POLICY "Allow public read-write for submissions"
    ON public.submissions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 5. Safe Realtime Publication (Enables instant multi-client live sync)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'forms'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.forms;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' 
        AND schemaname = 'public' 
        AND tablename = 'submissions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.submissions;
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Realtime publication notice: %', SQLERRM;
END $$;
