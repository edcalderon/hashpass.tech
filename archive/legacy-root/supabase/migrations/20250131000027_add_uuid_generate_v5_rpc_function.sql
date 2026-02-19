-- Create RPC function to generate UUID v5 (for use in scripts)
CREATE OR REPLACE FUNCTION uuid_generate_v5_rpc(namespace_uuid TEXT, name_text TEXT)
RETURNS UUID AS $$
BEGIN
    RETURN uuid_generate_v5(namespace_uuid::UUID, name_text);
END;
$$ LANGUAGE plpgsql;

