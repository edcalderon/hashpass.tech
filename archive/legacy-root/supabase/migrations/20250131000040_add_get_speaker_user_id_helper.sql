-- Create helper function to get speaker user_id - returns UUID with perfect type inference
CREATE OR REPLACE FUNCTION get_speaker_user_id(p_speaker_uuid UUID) RETURNS UUID AS $$
    SELECT user_id::UUID FROM public.bsl_speakers WHERE id = p_speaker_uuid;
$$ LANGUAGE sql STABLE;

