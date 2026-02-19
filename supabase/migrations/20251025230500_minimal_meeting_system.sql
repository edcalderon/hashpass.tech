-- Minimal meeting system migration
-- Just the basics to get things working

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.generate_weekly_slots(UUID, DATE);

-- Drop existing table if it exists
DROP TABLE IF EXISTS public.meeting_slots CASCADE;

-- Create meeting_slots table (simplest possible)
CREATE TABLE public.meeting_slots (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'available',
    meeting_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_slot UNIQUE (user_id, start_time)
);

-- Create indexes
CREATE INDEX idx_meeting_slots_user_id ON public.meeting_slots(user_id);
CREATE INDEX idx_meeting_slots_status ON public.meeting_slots(status);

-- Simple function to generate slots (minimal version)
CREATE OR REPLACE FUNCTION public.generate_weekly_slots(
    user_uuid UUID, 
    start_date DATE
) 
RETURNS JSONB 
LANGUAGE plpgsql 
AS $$
DECLARE
    day_offset INT;
    v_current_time TIMESTAMPTZ;
    slots_created INT := 0;
BEGIN
    -- Clear existing future slots for this user
    DELETE FROM public.meeting_slots 
    WHERE user_id = user_uuid 
    AND start_time >= start_date::TIMESTAMPTZ
    AND status != 'booked';
    
    -- Simple slot generation (just one slot per day for now)
    FOR day_offset IN 0..6 LOOP
        v_current_time := (start_date::TIMESTAMPTZ + (day_offset * INTERVAL '1 day') + INTERVAL '9 hours');
        
        INSERT INTO public.meeting_slots 
        (user_id, start_time, end_time, status)
        VALUES 
        (user_uuid, v_current_time, v_current_time + INTERVAL '15 minutes', 'available')
        ON CONFLICT (user_id, start_time) DO NOTHING;
        
        slots_created := slots_created + 1;
    END LOOP;
    
    -- Return success response
    RETURN jsonb_build_object(
        'success', true,
        'message', 'Successfully generated weekly slots',
        'slots_created', slots_created
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'message', 'Failed to generate slots: ' || SQLERRM
    );
END;
$$;

-- Basic permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.meeting_slots TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_weekly_slots(UUID, DATE) TO authenticated;
