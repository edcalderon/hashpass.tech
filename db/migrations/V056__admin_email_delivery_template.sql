ALTER TABLE public.admin_email_deliveries
  ADD COLUMN IF NOT EXISTS template text NOT NULL DEFAULT 'branded' CHECK (template IN ('branded', 'raw'));
