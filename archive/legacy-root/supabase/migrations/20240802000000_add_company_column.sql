-- Add company column to bsl_speakers table
ALTER TABLE public.bsl_speakers 
ADD COLUMN IF NOT EXISTS company TEXT;

-- Add twitter column to bsl_speakers table
ALTER TABLE public.bsl_speakers 
ADD COLUMN IF NOT EXISTS twitter TEXT;

-- Update existing records to extract company from bio field
UPDATE public.bsl_speakers 
SET company = CASE 
    WHEN bio LIKE '%at %' THEN 
        TRIM(SUBSTRING(bio FROM 'at (.+)$'))
    ELSE 
        NULL
END
WHERE company IS NULL;

-- Update existing records to set default twitter URLs
UPDATE public.bsl_speakers 
SET twitter = 'https://twitter.com/' || LOWER(REPLACE(REPLACE(name, ' ', '-'), 'á', 'a'))
WHERE twitter IS NULL;
