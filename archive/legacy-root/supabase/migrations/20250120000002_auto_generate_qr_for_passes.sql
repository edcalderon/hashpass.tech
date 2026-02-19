-- Auto-generate QR codes when passes are created or activated
-- This ensures every active pass has a QR code available

-- Function to generate QR code for a pass
CREATE OR REPLACE FUNCTION auto_generate_pass_qr()
RETURNS TRIGGER AS $$
DECLARE
    v_qr_id UUID;
BEGIN
    -- Only generate QR for active passes
    IF NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status != 'active') THEN
        -- Generate QR code using the existing function
        BEGIN
            SELECT generate_pass_qr(NEW.id, 30, 1) INTO v_qr_id;
            
            -- Log if QR generation fails (non-blocking)
            IF v_qr_id IS NULL THEN
                RAISE WARNING 'Failed to auto-generate QR code for pass %', NEW.id;
            END IF;
        EXCEPTION WHEN OTHERS THEN
            -- Don't fail the pass creation if QR generation fails
            RAISE WARNING 'Error auto-generating QR code for pass %: %', NEW.id, SQLERRM;
        END;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_auto_generate_pass_qr ON public.passes;

-- Create trigger for new passes
CREATE TRIGGER trigger_auto_generate_pass_qr
    AFTER INSERT ON public.passes
    FOR EACH ROW
    WHEN (NEW.status = 'active')
    EXECUTE FUNCTION auto_generate_pass_qr();

-- Create trigger for status updates (when pass becomes active)
CREATE TRIGGER trigger_auto_generate_pass_qr_on_activate
    AFTER UPDATE ON public.passes
    FOR EACH ROW
    WHEN (NEW.status = 'active' AND OLD.status != 'active')
    EXECUTE FUNCTION auto_generate_pass_qr();

-- Comment
COMMENT ON FUNCTION auto_generate_pass_qr IS 'Automatically generates a QR code when a pass is created or activated';

