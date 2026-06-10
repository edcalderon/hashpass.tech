-- Clean BSL_Speakers data and add user_id field
-- This script will:
-- 1. Drop the existing table
-- 2. Recreate it with user_id field
-- 3. Insert clean data with user_id mappings

-- First, let's drop the existing table and recreate it with the new structure
DROP TABLE IF EXISTS public.BSL_Speakers CASCADE;

-- Recreate the table with user_id field
CREATE TABLE public.BSL_Speakers (
  id text primary key,
  name text not null,
  title text,
  linkedin text,
  bio text,
  imageUrl text,
  tags text[] default '{}',
  availability jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  company text,
  twitter text,
  updated_at timestamptz default now(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create index for better performance on user_id lookups
CREATE INDEX IF NOT EXISTS idx_bsl_speakers_user_id ON public.BSL_Speakers(user_id);

-- Enable RLS
ALTER TABLE public.BSL_Speakers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "speakers_select" ON public.BSL_Speakers
FOR SELECT USING (true);

CREATE POLICY "speakers_update_own" ON public.BSL_Speakers
FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "speakers_insert_own" ON public.BSL_Speakers
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Insert clean speaker data with user_id mappings
-- For now, we'll only add Edward Calderon with his user_id
-- Other speakers will have NULL user_id until they register

INSERT INTO public.BSL_Speakers (id, name, title, linkedin, bio, imageurl, tags, availability, created_at, company, twitter, updated_at, user_id) VALUES
-- Edward Calderon - the main speaker who needs user_id
('edward-calderon-speaker', 'Edward Calderon', 'Tech Lead & Blockchain Expert', 'https://linkedin.com/in/edward-calderon', 'Edward Calderon is a technology leader and blockchain expert with extensive experience in developing innovative solutions. He specializes in blockchain technology, smart contracts, and decentralized applications.', 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-edward-calderon.png', '{blockchain,technology,leadership,innovation}', '[]', NOW(), 'HashPass', 'https://twitter.com/edward-calderon', NOW(), '13e93d3b-0556-4f0d-a065-1f013019618b'::uuid),

-- Other speakers (without user_id for now - they can be added later when they register)
('550e8400-e29b-41d4-a716-446655440001', 'Claudia Restrepo', 'Rectora', 'https://linkedin.com/in/claudia-restrepo', 'Experienced professional in Rectora at EAFIT.', 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-claudia-restrepo.png', '{Blockchain,FinTech,Innovation}', '{"friday": {"end": "17:00", "start": "09:00"}, "monday": {"end": "17:00", "start": "09:00"}, "tuesday": {"end": "17:00", "start": "09:00"}, "thursday": {"end": "17:00", "start": "09:00"}, "wednesday": {"end": "17:00", "start": "09:00"}}', NOW(), 'EAFIT', 'https://twitter.com/claudia-restrepo', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440002', 'Leonardo Villar', 'Gerente General', 'https://linkedin.com/in/leonardo-villar', 'Experienced professional in Gerente General at Banco de la República.', 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-leonardo-villar.png', '{Blockchain,FinTech,Innovation}', '{"friday": {"end": "17:00", "start": "09:00"}, "monday": {"end": "17:00", "start": "09:00"}, "tuesday": {"end": "17:00", "start": "09:00"}, "thursday": {"end": "17:00", "start": "09:00"}, "wednesday": {"end": "17:00", "start": "09:00"}}', NOW(), 'Banco de la República', 'https://twitter.com/leonardo-villar', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440003', 'César Ferrari', 'Superintendente Financiero de Colombia', 'https://linkedin.com/in/césar-ferrari', 'Experienced professional in Superintendente Financiero de Colombia at Superintendencia Financiera.', 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-césar-ferrari.png', '{Blockchain,FinTech,Innovation}', '{"friday": {"end": "17:00", "start": "09:00"}, "monday": {"end": "17:00", "start": "09:00"}, "tuesday": {"end": "17:00", "start": "09:00"}, "thursday": {"end": "17:00", "start": "09:00"}, "wednesday": {"end": "17:00", "start": "09:00"}}', NOW(), 'Superintendencia Financiera', 'https://twitter.com/césar-ferrari', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440004', 'Alberto Naudon', 'Consejero', 'https://linkedin.com/in/alberto-naudon', 'Experienced professional in Consejero at Banco Central de Chile.', 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-alberto-naudon.png', '{Blockchain,FinTech,Innovation}', '{"friday": {"end": "17:00", "start": "09:00"}, "monday": {"end": "17:00", "start": "09:00"}, "tuesday": {"end": "17:00", "start": "09:00"}, "thursday": {"end": "17:00", "start": "09:00"}, "wednesday": {"end": "17:00", "start": "09:00"}}', NOW(), 'Banco Central de Chile', 'https://twitter.com/alberto-naudon', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440005', 'José Outumuro', 'Director Institutional sales EMEA', 'https://linkedin.com/in/josé-outumuro', 'Experienced professional in Director Institutional sales EMEA at Crypto.com.', 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-josé-outumuro.png', '{Blockchain,FinTech,Innovation}', '{"friday": {"end": "17:00", "start": "09:00"}, "monday": {"end": "17:00", "start": "09:00"}, "tuesday": {"end": "17:00", "start": "09:00"}, "thursday": {"end": "17:00", "start": "09:00"}, "wednesday": {"end": "17:00", "start": "09:00"}}', NOW(), 'Crypto.com', 'https://twitter.com/josé-outumuro', NOW(), NULL),

-- Add a few more key speakers
('550e8400-e29b-41d4-a716-446655440006', 'Efraín Barraza', 'Regional Expansion Manager - Latam', 'https://linkedin.com/in/efraín-barraza', 'Experienced professional in Regional Expansion Manager - Latam at Tether.', 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-efraín-barraza.png', '{Blockchain,FinTech,Innovation}', '{"friday": {"end": "17:00", "start": "09:00"}, "monday": {"end": "17:00", "start": "09:00"}, "tuesday": {"end": "17:00", "start": "09:00"}, "thursday": {"end": "17:00", "start": "09:00"}, "wednesday": {"end": "17:00", "start": "09:00"}}', NOW(), 'Tether', 'https://twitter.com/efraín-barraza', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440007', 'Sandra Meza', 'Vicepresidente Control Interno y Cumplimiento', 'https://linkedin.com/in/sandra-meza', 'Experienced professional in Vicepresidente Control Interno y Cumplimiento at BBVA.', 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-sandra-meza.png', '{Blockchain,FinTech,Innovation}', '{"friday": {"end": "17:00", "start": "09:00"}, "monday": {"end": "17:00", "start": "09:00"}, "tuesday": {"end": "17:00", "start": "09:00"}, "thursday": {"end": "17:00", "start": "09:00"}, "wednesday": {"end": "17:00", "start": "09:00"}}', NOW(), 'BBVA', 'https://twitter.com/sandra-meza', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440008', 'Sebastián Durán', 'Subdirector de Regulación', 'https://linkedin.com/in/sebastián-durán', 'Experienced professional in Subdirector de Regulación at Superintendencia Financiera de Colombia.', 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-sebastián-durán.png', '{Blockchain,FinTech,Innovation}', '{"friday": {"end": "17:00", "start": "09:00"}, "monday": {"end": "17:00", "start": "09:00"}, "tuesday": {"end": "17:00", "start": "09:00"}, "thursday": {"end": "17:00", "start": "09:00"}, "wednesday": {"end": "17:00", "start": "09:00"}}', NOW(), 'Superintendencia Financiera de Colombia', 'https://twitter.com/sebastián-durán', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440009', 'Rocelo Lopes', 'CEO', 'https://linkedin.com/in/rocelo-lopes', 'Experienced professional in CEO at SmartPay.', 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-rocelo-lopes.png', '{Blockchain,FinTech,Innovation}', '{"friday": {"end": "17:00", "start": "09:00"}, "monday": {"end": "17:00", "start": "09:00"}, "tuesday": {"end": "17:00", "start": "09:00"}, "thursday": {"end": "17:00", "start": "09:00"}, "wednesday": {"end": "17:00", "start": "09:00"}}', NOW(), 'SmartPay', 'https://twitter.com/rocelo-lopes', NOW(), NULL),

('550e8400-e29b-41d4-a716-446655440010', 'Ana Garcés', 'Chief Compliance Officer', 'https://linkedin.com/in/ana-garcés', 'Experienced professional in Chief Compliance Officer at Banco BHD.', 'https://blockchainsummit.la/wp-content/uploads/2025/09/foto-ana-garcés.png', '{Blockchain,FinTech,Innovation}', '{"friday": {"end": "17:00", "start": "09:00"}, "monday": {"end": "17:00", "start": "09:00"}, "tuesday": {"end": "17:00", "start": "09:00"}, "thursday": {"end": "17:00", "start": "09:00"}, "wednesday": {"end": "17:00", "start": "09:00"}}', NOW(), 'Banco BHD', 'https://twitter.com/ana-garcés', NOW(), NULL);

-- Update meeting_requests RLS policies to use the new user_id relationship
DROP POLICY IF EXISTS "Speakers can view requests to them" ON public.meeting_requests;
DROP POLICY IF EXISTS "Speakers can respond to requests" ON public.meeting_requests;

CREATE POLICY "Speakers can view requests to them" ON public.meeting_requests
FOR SELECT USING (
  speaker_id IN (
    SELECT id FROM public.BSL_Speakers WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Speakers can respond to requests" ON public.meeting_requests
FOR UPDATE USING (
  speaker_id IN (
    SELECT id FROM public.BSL_Speakers WHERE user_id = auth.uid()
  )
);

-- Add comment explaining the purpose
COMMENT ON COLUMN public.BSL_Speakers.user_id IS 'Links speaker record to auth.users table for generic speaker detection';
