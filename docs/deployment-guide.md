# Local setup and controlled Vercel deployment

Prerequisites: Node.js 22+ (verified locally with Node 24), npm, Git, a Supabase PostgreSQL project with Auth. Docker is needed only for a local Supabase stack. Vercel supports the Next.js App Router application directly. Use npm.cmd in PowerShell where script execution policy blocks npm.ps1.

## Database setup

1. Install dependencies using `npm.cmd ci`.
2. Local configuration is already initialized in supabase/config.toml. With Docker running, use `npm.cmd exec supabase -- start`. Copy the local API URL and publishable/anon-compatible key displayed by the CLI.
3. Apply the checked-in migration with `npm.cmd exec supabase -- migration up --local`, then inspect `npm.cmd exec supabase -- migration list --local`. These explicit local flags avoid linked remote resources. For a new hosted development project, manually run supabase/migrations/20261030124301_research_framework.sql in that project's SQL editor. Verify you selected the intended project. This repository does not automatically change any remote resource.
4. Verify all tables exist, RLS is enabled and authenticated API grants are present. Use the two-user integration test to prove isolation. Run Supabase security advisors and resolve findings. The local machine used for initial implementation lacked Docker and database credentials; schema execution is therefore a required next verification step.
5. Configure Supabase Auth email/password. Confirm development/test users. In production, configure permitted site/redirect URLs and a functioning SMTP provider if email confirmation is enabled. The UI reports email-confirmation requirements; it does not invent a successful session.

## Environment variables

Copy .env.example to .env.local. Set exactly:

| Variable                             | Exposure       | Value                                              |
| ------------------------------------ | -------------- | -------------------------------------------------- |
| NEXT_PUBLIC_SUPABASE_URL             | Browser/server | Supabase API project URL                           |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Browser/server | Publishable key (local legacy anon key compatible) |

No service-role key is used. Never add one with a NEXT_PUBLIC prefix. Test-only variables are explained in testing-strategy.md and must not be configured in production. Browser public variables are compiled at build time: rebuild after changes.

```powershell
npm.cmd run dev
# http://localhost:3000
npm.cmd test
npm.cmd run build
npm.cmd run start
```

## Vercel, after explicit approval

1. Complete live database integration and full E2E checks on a disposable environment.
2. Review the Git diff and secret hygiene; commit source and lockfile. Create a GitHub repository and push only when explicitly authorized. Git is initialized locally; no remote is automatically created.
3. Import that repository into Vercel, select Next.js, use Node 24 or a supported compatible runtime, install with npm ci, build with npm run build. Keep root directory at repository root.
4. Set the two production public variables to the intended production Supabase project. Apply the reviewed migration to that project only with permission. Add production Vercel URL to Supabase Auth configuration.
5. Deploy a preview first. Check sign-in, create/save, generation/history, validation, traceability, evaluation and authenticated downloads using non-sensitive data. Confirm user B cannot access user A's project.
6. Promote only after checks pass and approval is given. Retain version/tag, migration identity, runtime details, logs and screenshots. No deployment has been performed by the implementation task.

## Production considerations

Use HTTPS; maintain dependencies and check npm audit. RLS and verified tokens enforce ownership on all operations. Content is rendered as React text, not injected HTML. Secrets are never logged. Route handlers limit input streams to 256 KiB; generation is capped at 50 requirements and 2500 cases; experiments at 100 iterations. PostgreSQL functions provide atomic multi-record writes. Tables have FK and ownership constraints. Export kinds and formats are allowlisted and filenames are based on route IDs.

Before a public internet launch, configure platform rate limiting, quotas/backups/retention and monitoring. Current limits bound per-request work but are not a distributed per-user rate limiter. Bearer tokens are held by the Supabase browser session, so XSS prevention and account/session hygiene matter. Update Auth password policies to suit university requirements. This is a controlled academic system, not a claim of a fully audited public SaaS service.

References used for implementation: [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [changelog](https://supabase.com/changelog?types=breaking-change), and [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers).
