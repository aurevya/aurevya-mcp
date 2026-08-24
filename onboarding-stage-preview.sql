-- ============================================================================
-- AUREVYA PORTAL — STAGE GUARD, PREVIEW ONLY   (enforces nothing)
-- ============================================================================
-- Run this first. It installs the checks WITHOUT the trigger, so you can see
-- which clients would be blocked before anything starts refusing writes.
-- Nothing here changes data or behaviour, and no trigger is created.
--
-- The notices it prints list exactly which gates would be live. When the
-- report below looks right, run the full onboarding-stage-guard.sql, which is
-- this plus the trigger that enforces it.
-- ============================================================================

-- ── 0. Preflight ──────────────────────────────────────────────────────────
do $$
declare missing text[] := '{}';
        r record;
begin
  -- Confirmed against the live schema rather than the migration files, which
  -- are behind in places. (An earlier draft gated on
  -- client_onboardings.pre_qual_submitted_at, which does not exist — the
  -- column is in a migration that was never applied to this table.)
  for r in select * from (values
      ('client_onboardings','status'),
      ('client_onboardings','stage_history'),
      ('client_onboardings','updated_at'),
      ('client_onboardings','email'),
      ('client_onboardings','proposal_sent_at'),
      ('client_onboardings','kyc_upload_token'),
      ('client_onboardings','compliance_signed_off'),
      ('client_onboardings','risk_category'),
      ('structure_parties','onboarding_id'),
      ('structure_parties','kyc_status'),
      ('structure_parties','roles'),
      ('kyc_documents','client_id'),
      ('kyc_documents','party_id'),
      ('kyc_documents','status')
    ) as t(tbl,col)
  loop
    if not exists (select 1 from information_schema.columns
                   where table_schema='public' and table_name=r.tbl and column_name=r.col)
    then missing := missing || (r.tbl||'.'||r.col); end if;
  end loop;
  if array_length(missing,1) > 0 then
    raise exception 'Schema does not match what this guard expects. Missing: %',
      array_to_string(missing,', ');
  end if;
  raise notice 'Preflight passed.';

  -- Say out loud which checks will actually run. Two of the gates depend on
  -- optional tables, and a control that has quietly switched itself off is
  -- worse than no control at all.
  raise notice 'Gate: intake        <- a proposal has been sent';
  raise notice 'Gate: invited       <- an email address is on file';
  raise notice 'Gate: kyc_pending   <- at least one party, and an upload token';
  raise notice 'Gate: kyc_approved  <- every party approved, no rejected documents, compliance signed off';
  if to_regclass('public.ubo_declarations') is not null then
    raise notice 'Gate: kyc_approved  <- a UBO declaration from every shareholder';
  else
    raise warning 'NOT ENFORCED: ubo_declarations is absent, so shareholder UBO declarations are not checked';
  end if;
  if to_regclass('public.engagement_letters') is not null then
    raise notice 'Gate: engaged       <- a signed engagement letter';
  else
    raise warning 'NOT ENFORCED: engagement_letters is absent, so engagement cannot be verified';
  end if;
  raise notice 'Gate: active        <- an AML risk rating is recorded';
end $$;


-- ── 1. The pipeline ───────────────────────────────────────────────────────
-- The same eight stages, in the same order, as the portal's own stage bar.
-- Kept as a function rather than a table so there is one definition and no
-- chance of the data drifting from the code that reads it.
create or replace function public.onboarding_stage_rank(p_status text)
returns int
language sql immutable
as $fn$
  select case p_status
    when 'proposal'     then 1
    when 'intake'       then 2
    when 'invited'      then 3
    when 'kyc_pending'  then 4
    when 'kyc_approved' then 5
    when 'docs_pending' then 6
    when 'engaged'      then 7
    when 'active'       then 8
    else null
  end;
$fn$;

comment on function public.onboarding_stage_rank(text) is
  'Position of an onboarding stage in the pipeline, or null if unrecognised.';


-- ── 2. Is this client ready for a given stage? ────────────────────────────
-- Returns null when ready, or a sentence explaining what is outstanding.
-- Written as one function so the rule can be read in one place, and so the
-- portal (or a report) can ask "what is blocking this client?" without
-- attempting the update.
--
-- Optional tables are guarded with to_regclass: a project where engagement
-- letters or UBO declarations have not been set up should not be unable to
-- move clients at all.
-- Takes the row rather than an id, because the trigger has to judge the row
-- as it will be after the update, not as it is on disk. The portal advances a
-- client with a single statement that often sets the unblocking field at the
-- same time —
--     update client_onboardings set status='invited', pre_qual_submitted_at=now()
-- — and re-reading the table here would see the old values and refuse a move
-- that is in fact legitimate. (Found by test, having written it the wrong way
-- round first.)
create or replace function public.onboarding_stage_blocker_row(
  c        public.client_onboardings,
  p_target text
)
returns text
language plpgsql stable
security definer
set search_path = public, pg_temp
as $fn$
declare
  p_client_id  uuid := c.id;
  n_parties    int;
  n_unapproved int;
  n_rejected   int;
  missing_ubo  int;
  n_signed     int;
begin
  if p_target = 'intake' then
    if c.proposal_sent_at is null then
      return 'no proposal has been sent yet';
    end if;

  elsif p_target = 'invited' then
    -- "Welcome Sent" is an action staff take, and its real prerequisite —
    -- intake being complete — is already covered by the sequence rule. The
    -- only thing that can actually make the step impossible is having no
    -- address to send to.
    if coalesce(trim(c.email), '') = '' then
      return 'no email address on the record, so no welcome can be sent';
    end if;

  elsif p_target = 'kyc_pending' then
    select count(*) into n_parties
      from public.structure_parties where onboarding_id = p_client_id;
    if n_parties = 0 then
      return 'no parties have been registered, so there is nobody to request KYC from';
    end if;
    if c.kyc_upload_token is null then
      return 'no KYC upload token has been issued';
    end if;

  elsif p_target = 'kyc_approved' then
    select count(*) into n_parties
      from public.structure_parties where onboarding_id = p_client_id;
    if n_parties = 0 then
      return 'no parties have been registered';
    end if;

    select count(*) into n_unapproved
      from public.structure_parties
     where onboarding_id = p_client_id
       and coalesce(kyc_status,'pending') <> 'approved';
    if n_unapproved > 0 then
      return n_unapproved || ' of ' || n_parties ||
             ' part' || case when n_parties = 1 then 'y' else 'ies' end ||
             ' have not had their KYC approved';
    end if;

    -- a rejected document left lying around means the file is not clean,
    -- even if the party record was approved
    select count(*) into n_rejected
      from public.kyc_documents d
     where d.status = 'rejected'
       and (d.client_id = p_client_id
            or d.party_id in (select id from public.structure_parties
                               where onboarding_id = p_client_id));
    if n_rejected > 0 then
      return n_rejected || ' KYC document(s) are marked rejected and need replacing';
    end if;

    -- every Shareholder needs a UBO declaration on file
    if to_regclass('public.ubo_declarations') is not null then
      select count(*) into missing_ubo
        from public.structure_parties sp
       where sp.onboarding_id = p_client_id
         and 'Shareholder' = any(coalesce(sp.roles, '{}'::text[]))
         and not exists (select 1 from public.ubo_declarations u
                          where u.party_id = sp.id);
      if missing_ubo > 0 then
        return missing_ubo || ' shareholder(s) have not filed a UBO declaration';
      end if;
    end if;

    if coalesce(c.compliance_signed_off, false) is not true then
      return 'compliance has not signed off';
    end if;

  elsif p_target = 'docs_pending' then
    -- reaching here means KYC was approved, which the sequence rule already
    -- guarantees; nothing further to check before drafting the letter
    null;

  elsif p_target = 'engaged' then
    if to_regclass('public.engagement_letters') is null then
      return 'engagement_letters is not set up, so engagement cannot be confirmed';
    end if;
    select count(*) into n_signed
      from public.engagement_letters
     where client_id = p_client_id and status = 'signed';
    if n_signed = 0 then
      return 'no signed engagement letter on file';
    end if;

  elsif p_target = 'active' then
    -- An addition, not part of the portal's eight stages: a licensed
    -- corporate services provider should have an AML risk rating on file
    -- before a client goes into ongoing administration. Both risk_category
    -- and aml_risk exist on the table; either satisfies this.
    --
    -- If you would rather not enforce it, delete this branch — everything
    -- else is unaffected. Run the preview first: if ratings have not been
    -- recorded historically, this will show against every client.
    if coalesce(trim(c.risk_category), '') = ''
       and coalesce(trim(c.aml_risk), '') = '' then
      return 'no AML risk rating recorded';
    end if;
  end if;

  return null;
end;
$fn$;

-- Convenience wrapper for display: the view and any report ask by id.
create or replace function public.onboarding_stage_blocker(
  p_client_id uuid,
  p_target    text
)
returns text
language plpgsql stable
security definer
set search_path = public, pg_temp
as $fn$
declare c public.client_onboardings;
begin
  select * into c from public.client_onboardings where id = p_client_id;
  if not found then return 'client not found'; end if;
  return public.onboarding_stage_blocker_row(c, p_target);
end;
$fn$;

comment on function public.onboarding_stage_blocker(uuid,text) is
  'Null if the client may move to the target stage, otherwise why not. Safe to call for display.';




-- ── The report ────────────────────────────────────────────────────────────
-- Every client short of Active: the stage they are due next, and what would
-- hold it up. "-- ready --" means the guard would let it through today.
select
  c.full_name,
  c.status                                   as current_stage,
  nxt.stage                                  as next_stage,
  coalesce(public.onboarding_stage_blocker(c.id, nxt.stage), '-- ready --') as blocked_by
from public.client_onboardings c
cross join lateral (
  select s as stage
  from (values (1,'proposal'),(2,'intake'),(3,'invited'),(4,'kyc_pending'),
               (5,'kyc_approved'),(6,'docs_pending'),(7,'engaged'),(8,'active')) as t(r,s)
  where r = public.onboarding_stage_rank(c.status) + 1
) nxt
where public.onboarding_stage_rank(c.status) < 8
order by public.onboarding_stage_rank(c.status), c.full_name;
