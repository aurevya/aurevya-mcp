-- ============================================================================
-- "Staff land on the client portal instead of /admin"
-- ============================================================================
-- The routing is not the problem. In the deployed bundle both the root
-- redirect and the /admin guard already admit staff:
--
--   root:  role === 'admin' || role === 'staff'  ->  /admin/dashboard
--   guard: role !== 'admin' && role !== 'staff'  ->  /portal/dashboard
--
-- and the portal reads that role from public.profiles:
--
--   const { data: h } = await supabase.from('profiles').select('*')
--                                     .eq('id', uid).single();
--   if (!h || h.role === 'client' || !['admin','staff'].includes(h.role)) {
--       ... fall back to the client portal
--
-- So someone lands in the wrong place for one of exactly two reasons: their
-- role is not 'staff', or that select returns nothing. Note the `!h` — a row
-- that cannot be READ is treated identically to a client. Run sections 1 and
-- 2; between them they tell you which.
-- ============================================================================


-- ── 1. What role does each person actually have? ──────────────────────────
-- Anyone who should reach /admin must read exactly 'staff' or 'admin'.
-- Watch for 'Staff', ' staff', or null — the check is case-sensitive and
-- exact, so none of those will pass.
select
  p.email,
  p.full_name,
  p.role,
  p.is_active,
  case
    when p.role in ('admin','staff') then 'ok — goes to /admin'
    when p.role is null              then '*** null — goes to the client portal ***'
    when lower(trim(p.role)) in ('admin','staff')
                                     then '*** right word, wrong case or padding ***'
    else '*** goes to the client portal ***'
  end as lands_on
from public.profiles p
order by (p.role in ('admin','staff')) desc, p.email;


-- ── 2. Can they read their own profiles row? ──────────────────────────────
-- This is the one that bites after enabling RLS. The portal reads the role as
-- the signed-in user, so if profiles has RLS on and no policy letting someone
-- select their own row, the query returns null and the code treats them as a
-- client — with the correct role sitting right there in the table.
--
-- If rls_enabled is true and self_read_policies is 0, that is the cause.
select
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policy p
    where p.polrelid = c.oid and p.polcmd in ('r','*')) as select_policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'profiles';

-- ...and what those policies say:
select p.polname,
       pg_get_expr(p.polqual, p.polrelid) as using_expr,
       coalesce((select array_agg(r.rolname order by r.rolname)
                   from pg_roles r where r.oid = any(p.polroles)),
                array['public']::name[]) as roles
from pg_policy p
join pg_class c on c.oid = p.polrelid
where c.relname = 'profiles';


-- ============================================================================
-- FIXES — run whichever section 1 and 2 point at
-- ============================================================================

-- ── Fix A: the role is wrong ──────────────────────────────────────────────
-- Replace the addresses. Named explicitly rather than by a pattern: a rule
-- like "everyone @kundomal.com is staff" promotes any future client on that
-- domain without anyone noticing.
--
-- update public.profiles
--    set role = 'staff'
--  where email in ('someone@kundomal.com');

-- Case or whitespace only — safe, it cannot promote anyone:
--
-- update public.profiles
--    set role = lower(trim(role))
--  where role is not null
--    and role <> lower(trim(role))
--    and lower(trim(role)) in ('admin','staff','client');


-- ── Fix B: they cannot read their own row ─────────────────────────────────
-- Not recursive: the policy only references auth.uid() and profiles' own id,
-- so evaluating it does not re-enter the policy.
--
-- create policy "profiles_self_read" on public.profiles
--   for select to authenticated using (id = auth.uid());
--
-- Staff also need to see colleagues for the user-management screen, so add
-- this if it is not already there. It reads profiles from inside a policy on
-- profiles, which WOULD recurse — hence the SECURITY DEFINER helper, which is
-- the standard way round it.
--
-- create or replace function public.is_staff()
-- returns boolean language sql stable security definer
-- set search_path = public, pg_temp as $$
--   select exists (select 1 from public.profiles
--                   where id = auth.uid() and role in ('admin','staff'));
-- $$;
-- revoke all on function public.is_staff() from public;
-- grant execute on function public.is_staff() to authenticated;
--
-- create policy "profiles_staff_read" on public.profiles
--   for select to authenticated using (public.is_staff());


-- ── After either fix ──────────────────────────────────────────────────────
-- The role is read once when the session loads, so the person has to sign out
-- and back in — a refresh alone will not pick it up.
