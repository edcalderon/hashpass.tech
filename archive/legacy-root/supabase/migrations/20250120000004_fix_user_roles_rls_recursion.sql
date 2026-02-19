-- Fix infinite recursion in user_roles RLS policies
-- The "Admins can manage all roles" policy causes recursion because it queries user_roles
-- Solution: Remove the recursive policy and rely on service role for admin operations

-- Drop the problematic recursive policy
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;

-- Users can view their own roles (no recursion - just checks auth.uid())
-- This policy is safe and doesn't cause recursion
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

-- Service role can manage all roles (for admin operations via API)
-- This is safe because service_role bypasses RLS
DROP POLICY IF EXISTS "Service role can manage all roles" ON public.user_roles;
CREATE POLICY "Service role can manage all roles" ON public.user_roles
  FOR ALL USING (auth.role() = 'service_role');

-- Note: Admin role management should be done via:
-- 1. Service role (server-side operations)
-- 2. Admin API endpoints that use service role
-- 3. Direct database operations with service role

-- Comment explaining the policy structure
COMMENT ON POLICY "Users can view their own roles" ON public.user_roles IS 
  'Allows users to view their own roles. Safe - no recursion because it only checks auth.uid()';

COMMENT ON POLICY "Service role can manage all roles" ON public.user_roles IS 
  'Allows service role to manage all roles. Used for admin operations via API endpoints.';

