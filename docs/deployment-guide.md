# Vercel deployment guide

Verified 2 November 2026. Repository: `MaryNuella/MastersProjectSoftwareEng`. Approved database: **Miva SE Project (`gnfktaxebbdklmjlrdgy`)**, PostgreSQL 17. Ready for a controlled Vercel deployment once the manual settings below are complete. No deployment or hosted-domain test has been performed.

## Verified preparation

- Fresh `npm.cmd run build` passed with Next.js 16.4.3 and Node 24.21.0. Standard App Router pages and a Node.js API route are compatible with Vercel's Next.js preset; no vercel.json or static-export setting is needed. Existing security headers remain in next.config.mjs.
- Prompt 2 passed: 26 unit tests, live two-account Supabase integration, supplemental CRUD/condition checks and three Playwright checks. See delivery-status.md for actual results and resolved failures.
- Read-only remote verification confirmed all 11 tables have RLS, ten authenticated owner policies have USING and WITH CHECK, and rule_versions has authenticated SELECT policy. All three save RPCs are SECURITY INVOKER and deny anon execution. Neither anon nor authenticated has effective TRUNCATE access on these tables.
- The existing migration is applied and remote history matches `20261030124301_research_framework`. **Do not rerun it, reset the database or run deployment-time schema creation.** Earlier timestamp/grant warnings have been resolved.
- A pattern-based scan of all three locally reachable Git commits (44 unique blobs), tracked working files and 14 generated browser bundle files found no private key, Supabase secret key, password-bearing database URL or service-role JWT matches. Configured test passwords were absent from reachable history, tracked files and browser bundles. This is a scoped scan, not a guarantee about deleted remote refs or unknown credential formats. Only .env.example is tracked; .env.local is ignored. Frontend configuration contains the intended URL and public publishable key.
- Local changes to environment examples, delivery/deployment documentation and the browser test are still uncommitted. Review and commit/push the approved changes before selecting the deployment commit; no commit or push was performed during preparation.

## Vercel environment variables

Add only these application variables in Project Settings > Environment Variables:

| Name | Value | Environment scope |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | `https://gnfktaxebbdklmjlrdgy.supabase.co` | Production; Preview for the controlled preview; Development only if using Vercel local tooling |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | This exact project's enabled `sb_publishable_` key from Supabase Settings > API Keys or local .env.local | Same scopes as URL |

Both are intentionally browser-visible and also used server-side. Public variables are embedded at build time: redeploy after changing values. Confirm Preview and Production use this exact project; previews share its database and are not isolated databases. No privileged key or direct database connection is needed. Do not bulk-import .env.local: never upload TEST_* account passwords, TEST_ALLOW_DATABASE_WRITES, service-role/secret keys, database passwords or access tokens into the Vercel application environment. Keep test credentials only in the private local test process environment. No NEXT_PUBLIC_SITE_URL variable is read by this implementation.

## Supabase authentication domain settings

In the approved project's Authentication > URL Configuration, once the canonical domain is known:

1. Set **Site URL** to `https://<canonical-domain>/` (the final Vercel or custom domain), replacing a localhost default.
2. Add exact approved redirect destinations, such as `https://<canonical-domain>/` and the exact preview origin ending `/`. Retain localhost only if still used for development. Avoid broad `https://*.vercel.app/**` entries; prefer exact owned preview URLs.
3. Confirm email/password sign-in is enabled. If signup email confirmation is enabled, verify delivery, sender/SMTP configuration and a real confirmation link in the intended environment before launch.

The existing browser signUp call supplies no emailRedirectTo, so Supabase's Site URL is the default email-confirmation destination. Allowlisting a preview URL alone does not make signup return there. For preview testing use the existing confirmed disposable accounts; confirm signup on the canonical site after configuring its Site URL. There is no custom /auth/callback route to configure. Password sign-in happens in place; browser bearer tokens are verified server-side with auth.getUser and passed to the RLS-protected client.

The eventual domain has not been supplied, and current hosted Site URL, allowlist, email templates and SMTP settings were not inspected or modified with the available tools. These remain manual verification items, not completed checks.

## Connect GitHub to Vercel (manual)

1. Review the pending Git diff and .env exclusion, then commit/push only approved files to `MaryNuella/MastersProjectSoftwareEng`. Preserve the lockfile and existing migration.
2. In Vercel choose Add New > Project, connect GitHub and grant access to that repository. Select the intended reviewed commit/branch. Import/deploy actions can launch a deployment; proceed only when you intend to authorize that action.
3. Choose **Next.js**, repository root `.`, **Node.js 24.x**, install command `npm ci`, build command `npm run build`, and leave Output Directory at the framework default. Do not choose static export or add database migration commands. No custom start command is needed.
4. Add the two scoped environment variables above before building. For preview-first review, use a non-production branch and Vercel Preview environment; confirm the branch/deployment is Preview rather than assuming the import is a preview. Vercel normally treats main as the production branch.
5. After a domain is assigned, complete the Supabase URL/email checks above. Run the safe smoke test below on that exact deployment. Promote the verified commit only when approved. Adding a custom domain requires repeating the auth-domain checks.
6. Record commit SHA, Vercel URL/deployment ID, runtime, build log, smoke-test results and tester/date. Future Git pushes can trigger deployments; account for that before pushing subsequent changes. For rollback use a previously verified Vercel deployment; do not reset the database.

## Safe deployed smoke test

Use two isolated confirmed accounts and uniquely labelled `TEST-DEPLOY-<timestamp>-<uuid>` records. Record their exact IDs; never delete records by a broad prefix or touch existing research records. No live smoke test was run during this preparation.

1. Check landing/documentation pages and mobile layout. Signed-out GET /api/projects must return 401, without records or internal errors. Confirm browser network calls target only the approved Supabase URL and expose no privileged credentials.
2. Sign in as A, create a labelled project and a required password requirement (minLength 8, maxLength 20). Reject inverted bounds, then save/edit/reload the valid requirement. Generate cases and inspect positive/negative cases and lengths 7, 8, representative 12, 20 and 21.
3. Validate and reopen persisted history; confirm findings, traceability and cases survive reload. Download CSV and JSON for cases/validation/traceability and check their contents. Existing local tests already cover mutation-based duplicate/missing-condition reporting; any deployed mutation test must affect only the new session and use existing operations, never schema changes.
4. In a separate browser profile sign in as B and verify A's project, requirements and sessions cannot be retrieved or altered. Do not publish bearer tokens or include them in screenshots/logs. Sign out and confirm authenticated API access stops.
5. Delete only newly created requirement/project IDs through authenticated Supabase access where necessary (the current UI does not provide project deletion). Verify child test rows are cleaned through existing cascades. Never delete either account or unrelated rows.
6. Review Vercel logs for API errors without logging tokens/passwords. Record real passes/failures; stop promotion on an auth, persistence, export or isolation failure.

Existing Playwright configuration is bound to localhost and starts a local production server; its passed run is not evidence of testing a Vercel URL. Do not silently claim the unchanged Playwright command targets a deployed site. Use the manual deployed smoke test above.

## Local commands and operational scope

```powershell
npm.cmd ci
npm.cmd run build
npm.cmd run start
# Explicitly loaded, private test configuration for local verification only:
node --env-file=.env.local --test tests/integration/*.test.js
$env:PLAYWRIGHT_CHANNEL='msedge'
node --env-file=.env.local node_modules/@playwright/test/cli.js test
```

Keep .env.local private; do not overwrite it with .env.example. For a separate local Docker stack only, use `npm.cmd exec supabase -- start` and `npm.cmd exec supabase -- migration up --local`; those commands are not hosted deployment steps. No Docker is required for Vercel with the existing hosted project.

Before a public launch review backups/retention, quotas, monitoring, rate limiting and Supabase password/email policy. Existing request and generation limits do not provide distributed per-user rate limiting. This is a controlled academic application, not a completed production security audit. Only deployment documentation changed in this preparation; no hosting settings, Auth settings, application code or database permissions were changed.

References: [Vercel Next.js](https://vercel.com/docs/frameworks/full-stack/nextjs), [environment scopes](https://vercel.com/docs/environment-variables), [Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).
