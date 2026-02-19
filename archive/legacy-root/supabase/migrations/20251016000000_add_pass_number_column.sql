-- Add pass_number column to passes table if it doesn't exist
ALTER TABLE public.passes 
ADD COLUMN IF NOT EXISTS pass_number TEXT;

-- Update existing passes with generated pass numbers
UPDATE public.passes 
SET pass_number = 'BSL2025-' || pass_type::text || '-' || EXTRACT(EPOCH FROM created_at)::bigint
WHERE pass_number IS NULL;

-- Make pass_number NOT NULL after updating existing records
ALTER TABLE public.passes 
ALTER COLUMN pass_number SET NOT NULL;

-- Add unique constraint on pass_number
ALTER TABLE public.passes 
ADD CONSTRAINT unique_pass_number UNIQUE (pass_number);
