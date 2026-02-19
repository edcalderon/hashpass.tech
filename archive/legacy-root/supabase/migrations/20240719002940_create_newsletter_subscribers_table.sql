-- Create newsletter_subscribers table
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add index for faster lookups by email
CREATE INDEX IF NOT EXISTS idx_newsletter_subscribers_email 
ON public.newsletter_subscribers (email);

-- Add comments for documentation
COMMENT ON TABLE public.newsletter_subscribers IS 'Stores newsletter subscribers information';
COMMENT ON COLUMN public.newsletter_subscribers.email IS 'The email address of the subscriber, must be unique';
COMMENT ON COLUMN public.newsletter_subscribers.subscribed_at IS 'When the user subscribed to the newsletter';

-- Row level security (RLS) policy
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

-- Create a policy to allow public inserts (for the subscription form)
CREATE POLICY "Enable insert for all users" 
ON public.newsletter_subscribers
FOR INSERT 
TO authenticated, anon
WITH CHECK (true);

-- Create a policy to allow authenticated users to view all subscribers
CREATE POLICY "Enable read access for authenticated users" 
ON public.newsletter_subscribers
FOR SELECT 
TO authenticated
USING (true);

-- Create a function to update the updated_at column
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to update the updated_at column on each update
CREATE TRIGGER update_newsletter_subscribers_updated_at
BEFORE UPDATE ON public.newsletter_subscribers
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
