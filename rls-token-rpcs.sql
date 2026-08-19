-- ============================================================================
-- AUREVYA PORTAL — TOKEN-SCOPED RPCs  (Stage 2 of the RLS work)
-- ============================================================================
-- Run rls-hardening.sql Stage 1 first. Then run this. Then deploy the matching
-- HTML pages — until both sides are in place the public forms will not work,
-- so do the two together.
--
-- WHY THESE EXIST
-- ---------------
-- The public forms identify their visitor by a token in the URL:
--
--   /kyc-upload/<token>              client_onboardings.kyc_upload_token
--   /kyc-upload-party/<token>        structure_parties.kyc_upload_token
--   /ubo-declaration-form.html?token=<token>
--   /prequal/<token>                 pre_qual_responses.token
--
-- The token arrives in the query string, and a row-level security policy
-- cannot see the query string — only the row it is being asked to judge. That
-- is why the original policies ended up as USING (true) with a comment saying
-- the token was checked "by app logic". It was not being checked by anything
-- the database could enforce.
--
-- Passing the token as a function argument is what makes it checkable. Each
-- function below is SECURITY DEFINER, so it reads the table the caller cannot,
-- filters by the token itself, and returns only the columns the form actually
-- renders. With these in place the anon role needs no direct access to any of
-- these tables at all.
--
-- Every function pins search_path. Without that, a caller can point an
-- unqualified name at a schema of their own and have a definer function run
-- against tables it was never meant to touch.
--
-- Tokens are treated as secrets: they are the only thing standing between a
-- visitor and someone else's KYC file. Nothing here echoes a token back.
-- ============================================================================


-- ── 0. Preflight ──────────────────────────────────────────────────────────
-- The .sql files in this repo are behind the live schema in places
-- (kyc_documents_setup.sql has no party_id, for one), so the columns these
-- functions write are taken from the deployed bundle rather than from the
-- migrations. If any of them is missing, better to find out now than when
-- somebody is halfway through uploading a passport.
do $$
declare
  missing text[] := '{}';
  r record;
begin
  for r in
    select * from (values
      ('client_onboardings','kyc_upload_token'),
      ('structure_parties', 'kyc_upload_token'),
      ('structure_parties', 'kyc_status'),
      ('structure_parties', 'roles'),
      ('kyc_documents',     'party_id'),
      ('kyc_documents',     'client_id'),
      ('kyc_documents',     'file_path'),
      ('kyc_documents',     'file_size'),
      ('kyc_documents',     'mime_type'),
      ('ubo_declarations',  'party_id'),
      ('pre_qual_responses','token')
    ) as t(tbl, col)
  loop
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = r.tbl and column_name = r.col
    ) then
      missing := missing || (r.tbl || '.' || r.col);
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception 'Schema does not match what these functions expect. Missing: %',
      array_to_string(missing, ', ');
  end if;
  raise notice 'Preflight passed — every expected column is present.';
end $$;


-- ── 1. KYC upload: the client-level link  /kyc-upload/<token> ──────────────
-- Columns chosen to match what the page renders today: it shows the client's
-- name and service type, and uses the id to attach uploads.
create or replace function public.onboarding_by_upload_token(p_token uuid)
returns table (id uuid, full_name text, email text, service_type text)
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select co.id, co.full_name, co.email, co.service_type
  from public.client_onboardings co
  where co.kyc_upload_token = p_token
  limit 1;
$fn$;


-- ── 2. KYC upload: the per-party link  /kyc-upload-party/<token> ───────────
-- The page also shows the parent structure's name and service type, which the
-- React version fetched through an embedded join. Returned as two extra
-- columns rather than a nested object — simpler for a plain fetch to consume.
create or replace function public.party_by_upload_token(p_token uuid)
returns table (
  id uuid, onboarding_id uuid, full_name text, email text,
  roles text[], party_type text,
  structure_name text, service_type text
)
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select sp.id, sp.onboarding_id, sp.full_name, sp.email,
         sp.roles, sp.party_type,
         co.full_name, co.service_type
  from public.structure_parties sp
  left join public.client_onboardings co on co.id = sp.onboarding_id
  where sp.kyc_upload_token = p_token
  limit 1;
$fn$;


-- ── 3. Documents already uploaded under a token ───────────────────────────
-- Scoped by the token rather than by an id supplied by the caller: passing an
-- id would let anyone list any client's documents by guessing one.
-- review_notes is deliberately excluded — those are internal compliance notes
-- and the uploader has no business reading them.
create or replace function public.kyc_documents_by_upload_token(p_token uuid)
returns table (
  id uuid, document_type text, file_name text, file_path text,
  file_size bigint, mime_type text, status text, created_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select d.id, d.document_type, d.file_name, d.file_path,
         d.file_size, d.mime_type, d.status, d.created_at
  from public.kyc_documents d
  where d.client_id in (select id from public.client_onboardings where kyc_upload_token = p_token)
     or d.party_id  in (select id from public.structure_parties  where kyc_upload_token = p_token)
  order by d.created_at desc;
$fn$;


-- ── 4. Recording an upload ────────────────────────────────────────────────
-- Writes are token-scoped too. The old policy was
--   anon_kyc_docs_insert  WITH CHECK (EXISTS (SELECT 1 FROM client_onboardings
--                                             WHERE id = client_id))
-- which accepts any client_id that exists — so anyone could attach a document
-- to any client's file. Here the row can only ever land on the record the
-- token belongs to, because the caller does not get to choose it.
-- Column names here mirror the deployed bundle exactly rather than
-- kyc_documents_setup.sql, which is behind: the live upload writes
-- client_id, party_id, document_type, file_name, file_path, file_size,
-- mime_type, status. (Note that ubo-declaration-form.html currently posts
-- file_url and notes, neither of which is a column on this table — that
-- insert is being rejected today and the page never checks the response.
-- The rewritten form below goes through this function instead.)
create or replace function public.record_kyc_upload(
  p_token         uuid,
  p_document_type text,
  p_file_name     text,
  p_file_path     text,
  p_file_size     bigint default null,
  p_mime_type     text   default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_client uuid;
  v_party  uuid;
  v_id     uuid;
begin
  select id into v_client from public.client_onboardings where kyc_upload_token = p_token;
  if v_client is null then
    select id, onboarding_id into v_party, v_client
    from public.structure_parties where kyc_upload_token = p_token;
  end if;

  -- One generic message whether the token is unknown or merely wrong, so this
  -- cannot be used to work out which tokens exist.
  if v_client is null and v_party is null then
    raise exception 'invalid or expired link';
  end if;

  insert into public.kyc_documents
    (client_id, party_id, document_type, file_name, file_path, file_size, mime_type, status)
  values
    (v_client, v_party, p_document_type, p_file_name, p_file_path, p_file_size, p_mime_type, 'pending')
  returning id into v_id;

  -- the party page marks the party in progress after an upload; keeping that
  -- here means the page cannot forget to, and cannot set it on someone else
  if v_party is not null then
    update public.structure_parties set kyc_status = 'in_progress' where id = v_party;
  end if;

  return v_id;
end;
$fn$;


-- ── 5. UBO declaration form ───────────────────────────────────────────────
-- Has the party behind this token already filed one? A boolean, not the row:
-- the form only needs to know whether to show "already submitted".
create or replace function public.ubo_declaration_exists(p_token uuid)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.ubo_declarations u
    join public.structure_parties sp on sp.id = u.party_id
    where sp.kyc_upload_token = p_token
  );
$fn$;

-- Submitting one. This replaces "Anyone can insert UBO declarations"
-- WITH CHECK (true), which let anyone file a declaration against any party_id
-- they cared to name. party_id and onboarding_id are now derived from the
-- token, so a submission can only ever attach to the party who was sent the
-- link. Re-submission is refused rather than silently duplicated.
create or replace function public.submit_ubo_declaration(
  p_token                uuid,
  p_full_name            text,
  p_date_of_birth        date,
  p_nationality          text,
  p_country_of_residence text,
  p_residential_address  text,
  p_ownership_percentage numeric,
  p_source_of_wealth     text,
  p_is_pep               boolean,
  p_signature_data       text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_party uuid;
  v_onb   uuid;
  v_id    uuid;
begin
  select id, onboarding_id into v_party, v_onb
  from public.structure_parties where kyc_upload_token = p_token;

  if v_party is null then
    raise exception 'invalid or expired link';
  end if;

  if exists (select 1 from public.ubo_declarations where party_id = v_party) then
    raise exception 'a declaration has already been submitted for this party';
  end if;

  insert into public.ubo_declarations (
    party_id, onboarding_id, full_name, date_of_birth, nationality,
    country_of_residence, residential_address, ownership_percentage,
    source_of_wealth, is_pep, declaration_agreed, signature_data, status)
  values (
    v_party, v_onb, p_full_name, p_date_of_birth, p_nationality,
    p_country_of_residence, p_residential_address, p_ownership_percentage,
    p_source_of_wealth, coalesce(p_is_pep, false), true, p_signature_data, 'submitted')
  returning id into v_id;

  -- The companion row that puts it in front of compliance. file_path is NOT
  -- NULL on this table and there is no uploaded file here, so it records
  -- where the declaration actually lives — its own row — rather than a blank.
  insert into public.kyc_documents
    (party_id, client_id, document_type, file_name, file_path, mime_type, status)
  values
    (v_party, v_onb, 'UBO Declaration Form',
     'UBO Declaration — ' || coalesce(p_full_name, ''),
     'ubo_declarations/' || v_id, 'application/x-aurevya-ubo-declaration', 'pending');

  return v_id;
end;
$fn$;


-- ── 6. Pre-qualification questionnaire  /prequal/<token> ──────────────────
-- Note the token here is text, not uuid — see onboarding_enhancements.sql.
-- Returns only what the page greets the person with. It deliberately does not
-- return `responses`: the form writes those, it never needs to read anybody's.
create or replace function public.prequal_by_token(p_token text)
returns table (
  name text, email text, whatsapp text,
  lead_id uuid, lead_type text, submitted_at timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $fn$
  select q.name, q.email, q.whatsapp, q.lead_id, q.lead_type, q.submitted_at
  from public.pre_qual_responses q
  where q.token = p_token
  limit 1;
$fn$;

create or replace function public.submit_prequal(p_token text, p_responses jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_rows int;
begin
  -- submitted_at is null in the predicate so a completed questionnaire cannot
  -- be overwritten by re-opening the link
  update public.pre_qual_responses
     set responses = p_responses, submitted_at = now()
   where token = p_token
     and submitted_at is null;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$fn$;


-- ── 7. Grants ─────────────────────────────────────────────────────────────
-- REVOKE FROM public first: a new function is executable by everyone by
-- default, so granting to anon without revoking leaves it open to every role.
do $$
declare f text;
begin
  foreach f in array array[
    'onboarding_by_upload_token(uuid)',
    'party_by_upload_token(uuid)',
    'kyc_documents_by_upload_token(uuid)',
    'record_kyc_upload(uuid,text,text,text,bigint,text)',
    'ubo_declaration_exists(uuid)',
    'submit_ubo_declaration(uuid,text,date,text,text,text,numeric,text,boolean,text)',
    'prequal_by_token(text)',
    'submit_prequal(text,jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end $$;


-- ── 8. Close the direct table access these replace ────────────────────────
-- Only run this once the new HTML pages are deployed. Everything above is
-- additive and safe on its own; this part is the cutover.
--
--   drop policy if exists "anon_onboarding_token_select"  on public.client_onboardings;
--   drop policy if exists "token_auth_onboarding_select"  on public.client_onboardings;
--   drop policy if exists "anon_kyc_docs_select"          on public.kyc_documents;
--   drop policy if exists "token_auth_kyc_select"         on public.kyc_documents;
--   drop policy if exists "anon_kyc_docs_insert"          on public.kyc_documents;
--   drop policy if exists "anon_party_kyc_insert"         on public.kyc_documents;
--   drop policy if exists "token_auth_kyc_insert"         on public.kyc_documents;
--   drop policy if exists "anon_parties_select"           on public.structure_parties;
--   drop policy if exists "authenticated_parties_select"  on public.structure_parties;
--   drop policy if exists "pre_qual_public_read"          on public.pre_qual_responses;
--
--   revoke all on public.client_onboardings from anon;
--   revoke all on public.structure_parties  from anon;
--   revoke all on public.kyc_documents      from anon;
--   revoke all on public.pre_qual_responses from anon;
--
-- Staff read these as the authenticated role through their own policies, which
-- are untouched. Check those exist before running the revokes — the audit's
-- section 2 lists them.
