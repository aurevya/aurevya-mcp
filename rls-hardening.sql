-- ============================================================================
-- AUREVYA PORTAL — RLS HARDENING
-- ============================================================================
-- Run rls-audit.sql FIRST and read the output. This script makes changes.
--
-- It is deliberately split into stages by risk. Stage 1 is safe to run now.
-- Stage 2 changes what anonymous visitors can read and must be matched by a
-- front-end deploy — read its notes before running it.
--
-- Every statement is written to be re-runnable.
-- ============================================================================


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ READ THIS FIRST — the profiles dependency                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- Almost every staff policy in this database is shaped like
--
--     using (exists (select 1 from public.profiles
--                     where profiles.id = auth.uid()
--                       and profiles.role in ('admin','staff')))
--
-- and a policy expression is itself subject to the policies on the tables it
-- reads. So that subquery only returns a row if the signed-in user is allowed
-- to read their own profiles row. If profiles has RLS enabled and no policy
-- granting that, the subquery is empty for everyone, every staff policy
-- quietly evaluates false, and staff lose access to the entire portal — with
-- no error anywhere, just empty screens.
--
-- Confirmed against Postgres, not assumed: with profiles carrying RLS and no
-- policy, a staff member reading ubo_declarations got 0 rows; adding a
-- self-read policy to profiles, the same query returned the row.
--
-- So before running anything below, check profiles has a self-read policy:
--
--     select polname, pg_get_expr(polqual, polrelid)
--     from pg_policy p join pg_class c on c.oid = p.polrelid
--     where c.relname = 'profiles';
--
-- If there is nothing there letting a user select their own row, add one
-- first. It is not recursive — a policy on profiles that only references
-- auth.uid() and profiles' own columns does not re-enter itself:
--
--     create policy "profiles_self_read" on public.profiles
--       for select to authenticated using (id = auth.uid());
--
-- This matters most for step 1.1, which switches RLS on wherever it is off.
-- If profiles is one of those tables, that step is what breaks the portal.


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STAGE 1 — safe to run now                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ── 1.1 Turn RLS on wherever it is off ─────────────────────────────────────
-- Switching RLS on for a table that has no policies makes it unreadable to
-- everyone except the service-role key. That is the correct default (deny,
-- then grant back deliberately) but it will break any page still reading the
-- table through the anon or authenticated role, so the notices below list
-- exactly which tables land in that state. Check them before you leave.
do $$
declare
  t record;
  n_enabled int := 0;
  n_bare    int := 0;
begin
  for t in
    select c.oid, n.nspname, c.relname,
           (select count(*) from pg_policy p where p.polrelid = c.oid) as npol
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind = 'r'
      and n.nspname = 'public'          -- storage.* is managed by Supabase
      and not c.relrowsecurity
  loop
    execute format('alter table %I.%I enable row level security', t.nspname, t.relname);
    n_enabled := n_enabled + 1;
    raise notice 'RLS enabled on %.%  (% existing policies)', t.nspname, t.relname, t.npol;
    if t.npol = 0 then
      n_bare := n_bare + 1;
      raise warning '  ^ NO POLICIES — this table is now readable only by the service-role key. Add policies or it will 404 in the portal.';
    end if;
  end loop;
  raise notice '--- % table(s) switched on, % of them with no policies ---', n_enabled, n_bare;

  -- The one that takes the whole portal down rather than one screen.
  if not exists (
    select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
    where c.relname = 'profiles' and p.polcmd in ('r','*')
  ) then
    raise warning 'profiles has no SELECT policy. Every staff policy reads profiles to check the role, so they will all evaluate false and the portal will show empty screens for everyone. See the note at the top of this file.';
  end if;
end $$;


-- ── 1.2 Close ubo_declarations to anonymous callers ───────────────────────
-- The setup migration created these two:
--     "Anyone can insert UBO declarations"  FOR INSERT WITH CHECK (true)
--     "Anyone can read UBO declarations"    FOR SELECT USING (true)
-- with the comment "token-gated by app logic". Row-level security cannot see
-- the app's logic. USING (true) means anyone holding the anon key — which is
-- published in the browser bundle — can read every row of the table: full
-- name, date of birth, nationality, residential address, ownership
-- percentage, source of wealth, PEP status and the signature image.
--
-- Safe to run: the deployed bundle (checked against
-- dist132/assets/index-Aurevya127.js) contains no reference to
-- ubo_declarations at all. The UBO form exists only in the portal source,
-- which is not what is currently live. Nothing in production reads this
-- table anonymously.
--
-- Staff keep their access — they are signed in, so they are the
-- authenticated role, not anon.
drop policy if exists "Anyone can read UBO declarations"   on public.ubo_declarations;
drop policy if exists "Anyone can insert UBO declarations" on public.ubo_declarations;

create policy "Staff read UBO declarations"
  on public.ubo_declarations for select to authenticated
  using (exists (select 1 from public.profiles
                  where profiles.id = auth.uid()
                    and profiles.role in ('admin','staff')));

-- Revoking the grant as well as dropping the policy: with no grant the table
-- is unreachable for that role whatever a future policy says, which is the
-- more durable of the two.
revoke all on public.ubo_declarations from anon;


-- ── 1.3 Make views run as the caller ──────────────────────────────────────
-- A view executes with its owner's rights unless security_invoker is set, so
-- a view over a protected table hands the caller everything the owner can
-- see and the underlying policies never run. Section 4 of the audit lists
-- any that are still owner-run; add them here.
alter view if exists public.client_unread_messages set (security_invoker = true);


-- ── 1.4 Pin search_path on SECURITY DEFINER functions ─────────────────────
-- A definer function without a fixed search_path can be pointed at a
-- different schema by the caller and made to run against tables it was never
-- meant to touch. Section 5 of the audit lists any with "(no search_path
-- set)"; add an ALTER for each. Example:
--
--   alter function public.is_staff() set search_path = public, pg_temp;


-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ STAGE 2 — needs a matching front-end deploy. Do not run blind.           ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- These four policies are what the public KYC-upload links run on:
--
--   client_onboardings  "anon_onboarding_token_select"   TO anon  USING (true)
--   client_onboardings  "token_auth_onboarding_select"   TO authenticated USING (true)
--   kyc_documents       "anon_kyc_docs_select"           TO anon  USING (true)
--   structure_parties   "anon_parties_select"            TO anon  USING (true)
--
-- The intent was "anonymous visitor holding a valid upload token". What was
-- written is "anyone at all". The token travels in the query string
-- (?kyc_upload_token=eq.<uuid>) and a policy cannot see the query string, so
-- there is no predicate that fixes this in place — the lookup has to move
-- behind a function that takes the token as an argument.
--
-- Note also that "authenticated" is not the safeguard it reads as: if
-- anonymous sign-ins are on in Auth settings (kyc_anon_session_policies.sql
-- says to enable them) then any visitor can mint an authenticated session.
--
-- The replacement below is complete and correct, but the moment it runs the
-- current public upload pages stop resolving their tokens, because they query
-- the tables directly. The portal's React source is out of sync with the
-- deployed bundle (see deploy-to-portal.py), so that front-end change cannot
-- simply be rebuilt and shipped — it needs sorting out first.
--
-- Left commented deliberately. Say the word and I will do the front-end side
-- and we can cut them over together.

/*
-- Resolve a party from its upload token. SECURITY DEFINER so it can read the
-- table the caller cannot, returning one row and only the columns the public
-- form actually uses (id, onboarding_id, full_name).
create or replace function public.party_by_upload_token(p_token uuid)
returns table (id uuid, onboarding_id uuid, full_name text)
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select sp.id, sp.onboarding_id, sp.full_name
  from public.structure_parties sp
  where sp.kyc_upload_token = p_token
  limit 1;
$fn$;

revoke all on function public.party_by_upload_token(uuid) from public;
grant execute on function public.party_by_upload_token(uuid) to anon, authenticated;

-- Same for the onboarding record behind a token.
create or replace function public.onboarding_by_upload_token(p_token uuid)
returns table (id uuid, full_name text, email text)
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select co.id, co.full_name, co.email
  from public.client_onboardings co
  where co.kyc_upload_token = p_token
  limit 1;
$fn$;

revoke all on function public.onboarding_by_upload_token(uuid) from public;
grant execute on function public.onboarding_by_upload_token(uuid) to anon, authenticated;

-- Documents already uploaded under a token, for the status list.
create or replace function public.kyc_documents_by_upload_token(p_token uuid)
returns table (id uuid, document_type text, file_name text, status text, uploaded_at timestamptz)
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select d.id, d.document_type, d.file_name, d.status, d.uploaded_at
  from public.kyc_documents d
  where d.client_id in (select id from public.client_onboardings where kyc_upload_token = p_token)
     or d.party_id  in (select id from public.structure_parties  where kyc_upload_token = p_token);
$fn$;

revoke all on function public.kyc_documents_by_upload_token(uuid) from public;
grant execute on function public.kyc_documents_by_upload_token(uuid) to anon, authenticated;

-- With the lookups above in place, the blanket reads come out.
drop policy if exists "anon_onboarding_token_select"  on public.client_onboardings;
drop policy if exists "token_auth_onboarding_select"  on public.client_onboardings;
drop policy if exists "anon_kyc_docs_select"          on public.kyc_documents;
drop policy if exists "token_auth_kyc_select"         on public.kyc_documents;
drop policy if exists "anon_parties_select"           on public.structure_parties;
drop policy if exists "authenticated_parties_select"  on public.structure_parties;

-- Inserts stay open to anon (a visitor genuinely does need to upload without
-- an account) but scoped: the row must attach to a real onboarding or party.
-- Anon still cannot read anything back, so this cannot be used to enumerate.
drop policy if exists "token_auth_kyc_insert" on public.kyc_documents;

-- pre_qual_responses is the public enquiry form: inserts stay open, reads
-- close. Reading them back is a staff action.
--
-- CAUTION, and this bit is easy to miss: once the SELECT policy is gone,
-- INSERT ... RETURNING fails on this table — Postgres needs a SELECT policy
-- to hand the new row back, and PostgREST asks for it whenever the caller
-- sends Prefer: return=representation, which is what supabase-js does on
-- .insert(...).select(). A plain insert with return=minimal is fine. This
-- was confirmed the hard way against a real Postgres, not assumed:
--
--   insert ... values (...);              -> INSERT 0 1
--   insert ... values (...) returning id; -> ERROR: new row violates
--                                            row-level security policy
--
-- So every public form writing to these tables has to stop asking for the
-- row back. The UBO form's restPost() already sends no Prefer header, so it
-- is fine; check any form that uses supabase-js .insert().select().
drop policy if exists "pre_qual_public_read" on public.pre_qual_responses;
create policy "pre_qual_staff_read"
  on public.pre_qual_responses for select to authenticated
  using (exists (select 1 from public.profiles
                  where profiles.id = auth.uid()
                    and profiles.role in ('admin','staff')));
*/


-- ── Re-run the audit afterwards to confirm ────────────────────────────────
-- \i rls-audit.sql   (or just paste it in again)
