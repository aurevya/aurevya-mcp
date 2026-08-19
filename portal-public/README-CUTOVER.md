# Public forms — cutover runbook

The four pages in this folder are the portal's unauthenticated forms. They
used to live inside the React bundle (the two KYC upload links) or read the
database directly (the UBO and pre-qualification forms). They now talk to the
database only through token-scoped functions, which is what allows the
blanket-read policies to be dropped.

## Why they are here and not in the React source

`aurevya-portal-source` cannot rebuild the deployed site. The live bundle has
fourteen routes the source has never had — `/kyc-upload/:token`,
`/kyc-upload-party/:token`, `/proposal/:token`, `/sign/:token`,
`/reset-password`, and the admin `audit`, `checklist`, `comms`, `compliance`,
`engagement`, `profile`, `proposals`, `regulatory` and `settings` pages — and
there are no sourcemaps to recover it from. Rebuilding from source would
delete all fourteen.

Moving the public forms out sidesteps that entirely: they are plain files, so
they can be changed, reviewed and tested without touching the bundle. The
React routes stay in the bundle, unused, until the redirects are removed —
which is also the rollback.

## Order of operations

Both halves have to go out together. The pages need the functions; the
functions are what make it safe to drop the old policies.

1. **`rls-hardening.sql` Stage 1** — if not already run. Safe on its own.
2. **`rls-token-rpcs.sql`, sections 0–7.** Additive: it creates the functions
   and grants them. Nothing breaks at this point, because the old policies are
   still in place. The preflight block will stop with a clear message if the
   live schema does not have a column these functions write.
3. **Deploy the site.** Run `DOUBLE-CLICK-TO-DEPLOY-PROPOSAL-GENERATOR.bat`,
   then drag the new zip onto Netlify. That script now carries this folder and
   the `_redirects` with it.
4. **Check the four pages against a real token** before the last step — see
   below. Until section 8 is run, both the old and new paths work, so this is
   a safe place to stop and look.
5. **`rls-token-rpcs.sql` section 8** — the cutover. Drops the blanket-read
   policies and revokes the anon grants.

Rolling back after step 5 means re-granting; rolling back before it means
deleting the redirect lines. Step 4 is deliberately the point of no urgency.

## What to check at step 4

Take a real token out of the database, then open each page:

| Page | Expect |
|---|---|
| `/kyc-upload/<token>` | Client name, service type, the eight-document checklist |
| `/kyc-upload-party/<token>` | Party name, their roles, the parent structure. Individuals get the identity checklist, corporate parties the constitutional one |
| `/ubo-declaration-form.html?token=<token>` | The form, or "Already Submitted" if one has been filed |
| `/prequal/<token>` | The questionnaire, or "Already Submitted" |

And with a made-up token, each should say the link is invalid rather than
showing anything.

Then upload one document and confirm it appears in the staff KYC screen
attached to the right client or party.

## Two behaviours that changed on purpose

**A UBO declaration can no longer be filed twice.** The old policy was
`WITH CHECK (true)`, so anyone could post a declaration against any `party_id`
they named, as many times as they liked. `submit_ubo_declaration` derives the
party from the token and refuses a second one.

**A completed pre-qualification link can no longer be overwritten.**
`submit_prequal` only updates a row whose `submitted_at` is still null.

## One thing worth knowing about the old code

`ubo-declaration-form.html` posted `file_url` and `notes` to `kyc_documents`.
Neither is a column on that table, so PostgREST was rejecting that insert —
and the page never looked at the response, so it reported success either way.
Any UBO declaration submitted through that form is in `ubo_declarations` but
has no companion row in `kyc_documents`, which is the table the compliance
screen reads. Worth a look before assuming the screen is complete:

```sql
select u.id, u.full_name, u.submitted_at
from public.ubo_declarations u
where not exists (
  select 1 from public.kyc_documents d
  where d.party_id = u.party_id and d.document_type = 'UBO Declaration Form'
);
```

The rewritten form goes through `submit_ubo_declaration`, which writes both
rows in one transaction, so it cannot happen again.

## Storage

The `kyc-documents` bucket still has its own policies, which grant anon insert
and select on the whole bucket rather than per token. Object paths are
`<id>/<type>_<timestamp>.<ext>`, so they are not guessable without the id —
but that is obscurity, not a control. Worth tightening separately; it is not
part of this change.
