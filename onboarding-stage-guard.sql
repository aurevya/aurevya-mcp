-- ============================================================================
-- AUREVYA PORTAL — ONBOARDING STAGE GUARD
-- ============================================================================
-- Stops a client being advanced past a stage whose work has not been done.
--
-- WHY THIS IS IN THE DATABASE
-- ---------------------------
-- The portal advances a client with a single call that writes whatever stage
-- it is handed, with no check of any kind:
--
--   async function $t(id, newStatus, extra) {
--     await supabase.from('client_onboardings')
--       .update({ status: newStatus, updated_at: ..., ...extra }).eq('id', id);
--     await supabase.from('client_onboardings')
--       .update({ stage_history: {...prev, [newStatus]: now} }).eq('id', id);
--   }
--
-- So today a client can go straight from Proposal to Active Client, and the
-- two writes are not atomic — a failure between them leaves the stage
-- advanced with no history of it.
--
-- Putting the rule in the browser would not fix either problem: the bundle
-- cannot currently be rebuilt from source, a client-side check is bypassable
-- by anyone with the anon key, and the MCP server and the SQL editor write to
-- this table too. A trigger sees every write from every direction.
--
-- WHAT IT ENFORCES
-- ----------------
--   1. The stage must be one of the eight the portal knows.
--   2. Forward moves go one step at a time. No skipping.
--   3. Each stage has prerequisites, checked against the actual records —
--      not a checkbox someone ticked.
--   4. Backwards moves are allowed (mistakes happen) and recorded.
--   5. stage_history is stamped by the trigger, in the same statement.
--
-- An admin can override with a written reason. A process with no escape
-- hatch gets worked around in ways nobody can see; this one is recorded.
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


-- ── 3. The trigger ────────────────────────────────────────────────────────
create or replace function public.enforce_onboarding_stage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  old_rank  int;
  new_rank  int;
  blocker   text;
  override  text;
  is_admin  boolean;
  stamp     timestamptz := now();
begin
  if new.status is not distinct from old.status then
    return new;                      -- not a stage change
  end if;

  new_rank := public.onboarding_stage_rank(new.status);
  if new_rank is null then
    raise exception 'Unknown onboarding stage "%". Valid stages: proposal, intake, invited, kyc_pending, kyc_approved, docs_pending, engaged, active.',
      new.status;
  end if;
  old_rank := coalesce(public.onboarding_stage_rank(old.status), 0);

  -- An override is a written reason set for the transaction by an admin:
  --   select set_config('aurevya.stage_override','reason here',true);
  override := nullif(current_setting('aurevya.stage_override', true), '');
  if override is not null then
    select exists (select 1 from public.profiles
                    where id = auth.uid() and role = 'admin') into is_admin;
    -- auth.uid() is null in the SQL editor, where the caller is already a
    -- superuser; treat that as authorised rather than blocking a data fix
    if auth.uid() is not null and not coalesce(is_admin, false) then
      raise exception 'Only an administrator may override the onboarding sequence.';
    end if;
  end if;

  if override is null then
    -- forward, one step at a time
    if new_rank > old_rank + 1 then
      raise exception
        'Cannot move % straight to % — the next stage is %. Complete it first, or have an administrator record an override.',
        coalesce(old.full_name, 'this client'), new.status,
        (select s from (values (1,'proposal'),(2,'intake'),(3,'invited'),(4,'kyc_pending'),
                               (5,'kyc_approved'),(6,'docs_pending'),(7,'engaged'),(8,'active'))
                   as t(r,s) where r = old_rank + 1);
    end if;

    -- and only if the work behind it is actually done
    if new_rank > old_rank then
      -- NEW, not the stored row: the unblocking field is frequently set in
      -- the same statement as the stage change
      blocker := public.onboarding_stage_blocker_row(new, new.status);
      if blocker is not null then
        raise exception 'Cannot move % to %: %.',
          coalesce(old.full_name,'this client'), new.status, blocker;
      end if;
    end if;
  end if;

  -- Stamped here, in the same statement as the stage change, so the two
  -- cannot disagree. The portal's separate stage_history write still runs and
  -- is harmless — it recomputes the same object.
  new.stage_history := coalesce(new.stage_history, old.stage_history, '{}'::jsonb)
    || jsonb_build_object(new.status, to_jsonb(stamp));

  -- A backwards move or an override is worth being able to find later.
  if new_rank < old_rank or override is not null then
    new.stage_history := new.stage_history || jsonb_build_object(
      '_exceptions',
      coalesce(new.stage_history -> '_exceptions', '[]'::jsonb) ||
      jsonb_build_array(jsonb_build_object(
        'at',     to_jsonb(stamp),
        'from',   old.status,
        'to',     new.status,
        'by',     to_jsonb(auth.uid()),
        'kind',   case when override is not null then 'override' else 'reverted' end,
        'reason', override
      )));
  end if;

  new.updated_at := stamp;
  return new;
end;
$fn$;

drop trigger if exists trg_enforce_onboarding_stage on public.client_onboardings;
create trigger trg_enforce_onboarding_stage
  before update of status on public.client_onboardings
  for each row execute function public.enforce_onboarding_stage();


-- ── 4. A view of what is blocking every client ────────────────────────────
-- So "where is everything stuck" is one query rather than a trawl. Runs as
-- the caller, so staff see it under their own policies.
create or replace view public.onboarding_next_step
with (security_invoker = true) as
select
  c.id,
  c.full_name,
  c.email,
  c.status                                            as current_stage,
  (select s from (values (1,'proposal'),(2,'intake'),(3,'invited'),(4,'kyc_pending'),
                         (5,'kyc_approved'),(6,'docs_pending'),(7,'engaged'),(8,'active'))
             as t(r,s)
    where r = public.onboarding_stage_rank(c.status) + 1)  as next_stage,
  public.onboarding_stage_blocker(
    c.id,
    (select s from (values (1,'proposal'),(2,'intake'),(3,'invited'),(4,'kyc_pending'),
                           (5,'kyc_approved'),(6,'docs_pending'),(7,'engaged'),(8,'active'))
               as t(r,s)
      where r = public.onboarding_stage_rank(c.status) + 1)
  )                                                        as blocked_by
from public.client_onboardings c
where public.onboarding_stage_rank(c.status) < 8;

comment on view public.onboarding_next_step is
  'Every client short of Active, with the stage they are due next and what is holding it up.';


-- ── 5. How to use the override ────────────────────────────────────────────
-- Both statements in one transaction — set_config(..., true) is local to it.
--
--   begin;
--     select set_config('aurevya.stage_override',
--                       'Signed letter received by post, scanned to SharePoint', true);
--     update public.client_onboardings set status = 'engaged' where id = '...';
--   commit;
--
-- The reason lands in stage_history._exceptions with who did it and when.
-- To read them back:
--
--   select full_name, jsonb_pretty(stage_history -> '_exceptions')
--   from public.client_onboardings
--   where stage_history ? '_exceptions';
