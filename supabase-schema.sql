-- =============================================================================
-- DomainPortal - Supabase Database Schema & Multi-Tenant Data Isolation
-- =============================================================================
-- Instructions:
-- 1. Open your Supabase Project Dashboard (https://supabase.com/dashboard)
-- 2. Navigate to "SQL Editor" in the left sidebar
-- 3. Paste this entire script and click "Run"
-- =============================================================================

-- 1. Create Users / Profiles Table
CREATE TABLE IF NOT EXISTS public.users (
  id TEXT PRIMARY KEY,                       -- Firebase UID or internal user ID
  name TEXT NOT NULL,                        -- Full name / Company
  client_ref TEXT NOT NULL,                  -- Client reference (e.g. 'Client #101' or custom)
  email TEXT UNIQUE NOT NULL,                -- User email
  password_hash TEXT DEFAULT '',             -- Optional hash if using local auth
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Create Domains Table (Strict Multi-Tenancy via user_id)
CREATE TABLE IF NOT EXISTS public.domains (
  id TEXT PRIMARY KEY,                       -- Unique domain submission ID
  user_id TEXT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  client_ref TEXT NOT NULL,                  -- Display client ref (e.g. 'Client #101')
  user_email TEXT NOT NULL,                  -- Submitting user's email
  name TEXT NOT NULL,                        -- Clean domain name (e.g. 'cloudmatrix.com')
  category TEXT NOT NULL,                    -- Category (e.g. 'Tech & AI')
  price NUMERIC NOT NULL CHECK (price > 0),   -- Asking price in USD
  note TEXT DEFAULT '',                      -- Optional note / commentary
  status TEXT NOT NULL DEFAULT 'Available' CHECK (status IN ('Available', 'Pending', 'Sold')),
  date_added DATE DEFAULT CURRENT_DATE,      -- Date of listing
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Indexes for Instant Fast Queries & Search
CREATE INDEX IF NOT EXISTS idx_domains_user_id ON public.domains(user_id);
CREATE INDEX IF NOT EXISTS idx_domains_price ON public.domains(price);
CREATE INDEX IF NOT EXISTS idx_domains_status ON public.domains(status);
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

-- 5. Row Level Security Policies
-- Allow service_role full access (Express backend)
CREATE POLICY "Service role full access on users" ON public.users
  FOR ALL USING (true);

CREATE POLICY "Service role full access on domains" ON public.domains
  FOR ALL USING (true);

-- End of schema
