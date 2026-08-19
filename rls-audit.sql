-- ============================================================================
-- AUREVYA PORTAL — ROW-LEVEL SECURITY AUDIT                    (read-only)
-- ============================================================================
-- Paste into the Supabase SQL Editor and run. Nothing is modified: every
-- statement below is a SELECT against the catalogue.
--
-- Why this exists rather than a reading of the migration files: the .sql
-- files in this repo describe what was *intended*. A table created by hand in
-- the dashboard, or a migration that was written but never run, will not show
-- up there. This reads the live database.
--
-- Run each section and read the flagged column. Section 2 is the one that
-- matters most — a table can have RLS enabled and still be world-readable.
-- ============================================================================


-- ── 1. Every table in an API-exposed schema, and whether RLS is on ──────────
-- exposed_by_api: the schemas PostgREST serves. Anything here is reachable
--   with nothing but the anon key, which ships inside the browser bundle.
-- rls_enabled:    row-level security is switched on.
-- rls_forced:     policies apply to the table's owner too. Off is normal.
-- policies:       0 policies + RLS on = nobody can read it (locked, not leaky).
--                 0 policies + RLS off = anyone with the anon key reads it all.
select
  n.nspname                                              as schema,
  c.relname                                              as table,
  c.relrowsecurity                                       as rls_enabled,
  c.relforcerowsecurity                                  as rls_forced,
  (select count(*) from pg_policy p where p.polrelid = c.oid) as policies,
  case
    when not c.relrowsecurity then '*** RLS OFF — OPEN TO ANYONE ***'
    when (select count(*) from pg_policy p where p.polrelid = c.oid) = 0
      then 'RLS on, no policies — nothing readable'
    else 'ok'
  end                                                    as flag
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname in ('public', 'storage')
order by c.relrowsecurity, n.nspname, c.relname;


-- ── 2. Policies that do not actually restrict anything ─────────────────────
-- A policy of USING (true) granted to anon or authenticated means RLS is
-- switched on but every row is still returned. "authenticated" includes
-- anonymous sign-ins if those are enabled in Auth settings, so it is not the
-- safeguard it sounds like.
--
-- Read the roles column: {anon} or {public} is world-readable via the anon
-- key. {authenticated} is readable by anyone who can obtain any session.
select
  n.nspname                                       as schema,
  c.relname                                       as table,
  p.polname                                       as policy,
  case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                when 'w' then 'UPDATE' when 'd' then 'DELETE'
                else 'ALL' end                    as command,
  coalesce(
    (select array_agg(r.rolname order by r.rolname)
       from pg_roles r where r.oid = any(p.polroles)),
    array['public']::name[])                      as roles,
  pg_get_expr(p.polqual,      p.polrelid)         as using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid)         as with_check_expr
from pg_policy p
join pg_class c     on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname in ('public', 'storage')
  and (
        pg_get_expr(p.polqual,      p.polrelid) = 'true'
     or pg_get_expr(p.polwithcheck, p.polrelid) = 'true'
     or p.polqual is null
  )
order by n.nspname, c.relname, p.polname;


-- ── 3. What the anon role can reach at all ─────────────────────────────────
-- RLS only comes into play once the role holds the underlying grant. A table
-- with no grant to anon is unreachable regardless of its policies — which is
-- the cheapest way to close one that has no public flow.
select
  table_schema  as schema,
  table_name    as table,
  grantee,
  string_agg(distinct privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema in ('public', 'storage')
  and grantee in ('anon', 'authenticated')
group by table_schema, table_name, grantee
order by grantee, table_schema, table_name;


-- ── 4. Views — a common way round RLS ──────────────────────────────────────
-- A view runs as its owner unless security_invoker is set, so a view over a
-- protected table hands out everything the *owner* can see. Every view served
-- over the API should read security_invoker = true.
select
  n.nspname as schema,
  c.relname as view,
  coalesce(
    (select option_value
       from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'), 'false') as security_invoker,
  case when coalesce(
    (select option_value
       from pg_options_to_table(c.reloptions)
      where option_name = 'security_invoker'), 'false') <> 'true'
    then '*** runs as owner — bypasses RLS ***' else 'ok' end as flag
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'v'
  and n.nspname in ('public', 'storage')
order by n.nspname, c.relname;


-- ── 5. SECURITY DEFINER functions ──────────────────────────────────────────
-- These run with their creator's privileges and ignore RLS by design. That is
-- often deliberate (it is how a token lookup should be implemented) but each
-- one is a hole punched through the policies, so the list is worth reading.
-- An empty or unset search_path on one of these is separately a hazard.
select
  n.nspname                       as schema,
  p.proname                       as function,
  pg_get_function_identity_arguments(p.oid) as args,
  coalesce(array_to_string(p.proconfig, ', '), '(no search_path set)') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where p.prosecdef
  and n.nspname in ('public', 'storage')
order by n.nspname, p.proname;


-- ── 6. Storage buckets ─────────────────────────────────────────────────────
-- A public bucket serves its objects over an unauthenticated URL and storage
-- policies do not apply to those reads. KYC and UBO material must not sit in
-- a public bucket.
-- Run this section on its own — on a project where Storage was never
-- initialised the table does not exist and the statement errors, which would
-- stop the whole script if it were pasted in one go.
select
  id     as bucket,
  public as is_public,
  case when public then '*** PUBLIC — objects readable by URL ***' else 'ok' end as flag
from storage.buckets
order by public desc, id;
