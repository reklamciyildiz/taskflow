# Database Migration Instructions

## Problem
Users cannot be properly removed from organizations because the `organization_id` column in the `users` table has a NOT NULL constraint.

## Solution
Run the following migration in your Supabase database:

### Migration File: `20240107_make_organization_id_nullable.sql`

```sql
-- Make organization_id nullable in users table
-- This allows users to be removed from organizations while keeping their accounts

ALTER TABLE users 
ALTER COLUMN organization_id DROP NOT NULL;

-- Add comment to explain the change
COMMENT ON COLUMN users.organization_id IS 'Organization ID - nullable when user is removed from organization';
```

## How to Apply Migration

### Option 1: Supabase Dashboard
1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Copy and paste the SQL code above
4. Click "Run"

### Option 2: Supabase CLI
```bash
# If you have Supabase CLI installed
supabase db push
```

### Option 3: Direct Database Connection
```bash
# Using psql
psql YOUR_CONNECTION_STRING -f supabase/migrations/20240107_make_organization_id_nullable.sql
```

## What This Fixes

1. **Member Removal**: When an admin removes a member from the last team, the user is properly removed from the organization
2. **Security**: Removed users can no longer access the organization data
3. **Token Refresh**: JWT tokens are properly updated to reflect the organization change
4. **User Experience**: Removed users are redirected to onboarding to create/join a new organization

## Verification

After applying the migration:

1. Test removing a member from a team
2. Check that the user's `organization_id` becomes `null` in the database
3. Verify the user can no longer access the organization
4. Confirm the user is redirected to onboarding page

## Rollback (if needed)

```sql
-- Rollback the migration
ALTER TABLE users 
ALTER COLUMN organization_id SET NOT NULL;
```
