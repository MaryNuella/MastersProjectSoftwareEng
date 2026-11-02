# Delivery status — 30 October 2026

## Focused UI and documentation revision - 2 November 2026

Implemented shared charcoal/teal styling, responsive spacing and typography, keyboard focus/skip navigation, reduced-motion support, loading presentation, landing process explanations, persisted-only dashboard summaries, and actionable empty states. Requirements combines listing/create/edit; /requirement-editor redirects safely. Guided controls cover the existing eight types and synchronize with Advanced JSON. No new constraint semantics or rules were introduced.

The in-app academic handbook is derived from repository source and documentation, with architecture and traceability flow diagrams, rule catalogue, examples, experimental metric definitions and explicit limitations. Fixture sizes are distinguished from measured achievements.

Verification: 26 unit tests passed; final production build passed; 4 Playwright checks passed (40.7 seconds), including the existing live authenticated workflow on gnfktaxebbdklmjlrdgy, guided constraints/JSON synchronization, mobile overflow, documentation navigation and legacy redirect. Initial browser execution timed out because helper text was included in guided-input accessible names; explicit input labels corrected this and the fresh-build rerun passed. Desktop landing and mobile documentation captures were visually inspected; captures are Git-ignored under test-results. Existing disposable-test cleanup ran as part of the browser workflow.

No changes to lib research algorithms, API routes, authentication implementation, migrations, RLS or benchmark datasets. No push or deployment performed. New design is verified locally; the deployed site remains unchanged until a separately authorized release. The full live two-user integration suite was not rerun for this presentation-only revision; its prior passing result remains recorded below, and the live browser workflow was rerun.


## Prompt 2 authenticated verification — 2 November 2026

This checkpoint supersedes the blocked verification and original implementation status below. Target was exclusively **Miva SE Project (`gnfktaxebbdklmjlrdgy`)**. Existing application and test implementation were used; no database schema, migration history, RLS, or unrelated records were changed. Local application/test URLs and public keys were checked for equality before live writes. Credentials were loaded explicitly with Node's `--env-file=.env.local` and were not printed.

| Check | Actual result |
|---|---|
| Existing unit suite | 26 passed, 0 failed, 0 skipped; password boundaries, deterministic generation, validation mutations, duplicates, missing conditions, CSV escaping and JSON metadata |
| Existing real Supabase integration suite | 1 passed, 0 failed, 0 skipped; both accounts authenticated, owner persistence, cases/findings/traceability, JSON and CSV exports, validation replacement, cross-user read denial and RPC denial, transaction rollback, snapshot survival and disposable project cleanup |
| Supplemental authenticated CRUD verification | Passed project create/read/update/delete and requirement create/read/update/delete using a newly created TEST-CRUD UUID project; requirement update used existing save_requirement RPC; exact project absence confirmed after cleanup |
| Supplemental password/validation checks | Passed positive/negative generation and string lengths 7/8/12/20/21; complete cases report no missing conditions, a copied objective reports duplicates, and empty cases report missing conditions |
| Production build | Passed Next.js 16.4.3 optimized build, static generation and API compilation using .env.local |
| Playwright against production server / Microsoft Edge | Final run: 3 passed, 0 failed, 0 skipped (28.8 seconds total); landing/auth boundary, mobile viewport and complete authenticated workflow including invalid-constraint rejection, saved generation/validation, traceability, CSV download and persisted history reopening |

Actual initial failures: sandboxed integration failed at authentication with `AuthRetryableFetchError: fetch failed`; rerunning with network access passed. Initial browser run failed on transient "Project created" status even though the saved project row was visible. Only the test assertion was changed to verify that durable row. A subsequent browser run exceeded the default 30-second test limit; final execution with a 120-second limit passed. That limit is now recorded on the authenticated test. One launch approval review timed out before execution; its permitted retry launched successfully. These are reported as resolved execution/test-harness failures, not hidden or counted as passes.

All live writes were disposable TEST-/TEST-E2E-/TEST-CRUD records created by these runs. Existing integration and browser finally blocks completed cleanup without reported errors; supplemental cleanup explicitly confirmed absence of its project. No unrelated records were deleted. The application provides project creation/listing in its UI/API; project update/delete were verified through the existing authenticated Supabase client rather than claiming those UI controls exist.

**Prompt 2 passed; ready for Prompt 3.** This establishes the tested academic workflows, not a completed deployment or production operations/security audit. No deployment was attempted. Auth SMTP/production redirect settings, hosting configuration and operational controls remain deployment-stage work. Existing deployment-guide warnings describing unrepaired history/TRUNCATE grants are historical: those issues were resolved before this run.

## Verification checkpoint — 31 October 2026

This checkpoint supersedes the original setup statements below. Target: Miva SE Project (`gnfktaxebbdklmjlrdgy`), repository MaryNuella/MastersProjectSoftwareEng. Earlier database work applied the existing migration, removed application-role TRUNCATE privileges, and reconciled remote history to `20261030124301`; none of those operations was repeated during this verification attempt.

Current inspection confirmed that browser and server clients use the same NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY variables. Next.js environment loading resolved the exact target URL `https://gnfktaxebbdklmjlrdgy.supabase.co` and an sb_publishable_ key. No NEXT_PUBLIC variable named for a secret/service-role credential was present, and .env.local is Git-ignored. The key value was not logged. This verifies local configuration and source wiring, not a running browser bundle or current remote key acceptance.

Authentication source inspection confirmed email/password sign-in/sign-up, browser session bearer tokens, server-side auth.getUser verification, and owner-scoped database access. Actual login and ownership enforcement remain untested in this attempt.

**Stopped: missing authenticated test configuration.** TEST_USER_EMAIL, TEST_USER_PASSWORD, TEST_OTHER_EMAIL, TEST_OTHER_PASSWORD, TEST_SUPABASE_URL and TEST_SUPABASE_PUBLISHABLE_KEY are absent; TEST_ALLOW_DATABASE_WRITES is not enabled. Configure two isolated, confirmed email/password accounts privately in the local environment, point both application and test clients at this exact approved project, and enable the explicit test-write gate. Do not paste passwords into chat or commit them. The existing Node/Playwright runners do not automatically load .env.local for test-process variables; supply them through the test process environment or an explicit environment-loading invocation.

| Workflow/check | Actual outcome in this attempt |
|---|---|
| Client/API/auth source and local environment inspection | Completed; exact target URL and public key format confirmed |
| Actual authentication and user-owned CRUD | Blocked: no test account credentials |
| Password 8–20 generation and persisted cases/findings/traceability | Not run after authentication blocker |
| Duplicate/missing-condition detection and CSV/JSON workflow | Not run after authentication blocker |
| Two-user isolation | Blocked: no isolated account credentials |
| Integration, Playwright and production build | Not run: stopped as instructed when credentials were found missing |

No disposable records were created, no cleanup was needed, and no application code or database records were changed. No runtime failures were established. Deployment readiness is not established until authenticated integration and browser workflows pass; historical results below are not fresh verification results.

All application modules are implemented locally. The production build and local pure-engine/browser checks pass. The acceptance criteria requiring live Supabase persistence are **not yet verified** because this workspace has no configured Supabase credentials and no Docker/local PostgreSQL installation. No remote database, deployment or GitHub push has been performed.

## 1. Implemented modules

Projects; structured requirement create/read/edit/delete; eight field types and strict constraints; deterministic EP/BVA generation; independent correctness, objective, metadata and completeness assertions; objective-aware duplicate grouping; requirement/session/rule traceability; historical snapshots; authenticated Supabase repository operations; CSV/JSON exports; reproducible evaluation with actual monotonic timing; optional manually measured comparisons; landing, dashboard, editor, history and documentation pages.

## 2. Folder structure

app (pages/API), components (workspace), lib (pure research logic and server/browser adapters), benchmarks (static oracle), supabase (schema/config/migration), tests (unit/integration/E2E), scripts (experiment runner), docs (methodology/setup/evidence), artifacts (Git-ignored local raw evidence). See the root README for a tree.

## 3. Database

Migration: **supabase/migrations/20261030124301_research_framework.sql**, created by Supabase CLI 2.122.0. The SQL source matches supabase/schema.sql. Eleven tables: projects, requirements, constraints, rule_versions, generation_sessions, session_requirements, test_cases, validation_findings, traceability_mappings, evaluation_datasets, evaluation_runs. All enable RLS. The migration is supplied and reviewed but has not been executed here. Functions perform requirement, session and validation writes atomically under the caller's identity.

## 4. Rule catalogue

Version 1.0.0: EP-VALID, EP-EMPTY, EP-TYPE, EP-FORMAT, EP-ENUM, EP-BOOLEAN, EP-PRECISION, BVA-LENGTH, BVA-NUMBER, BVA-DATE. Full applicability, ordering, algorithms and supported limits are in rule-engine.md and the in-app Documentation page.

## 5–6. Verification

| Check | Actual outcome |
|---|---|
| Node unit tests | 26 passed; 0 failed |
| Supabase integration | 1 suite skipped; requires disposable database and two accounts |
| Playwright / installed Microsoft Edge | 2 passed; full authenticated workflow skipped |
| Production Next.js build | Passed; landing, 11 workspace routes and dynamic API compiled |
| Dependency audit after CLI update | 0 reported vulnerabilities |
| Responsive visual review | Desktop inspected; mobile overflow fixed and regression test passed |

Actual local logs are unit-results.log, integration-results.log and build-results.log (Git-ignored). Browser test output reports skips explicitly. Database tests cover persistence, RLS isolation, transaction rollback, snapshots, findings, matrix and exports when configured. A skip does not establish those behaviours.

## 7. Evaluation

Dataset 1.0.0 contains 10 requirements and 78 independently authored reference conditions. The local 30-repetition run generated/assessed 78 cases each time: 78/78 condition coverage, 78/78 correctness and 0 redundant cases, computed from actual outputs. Observed core time ranged from 0.231 to 5.456 ms, median 0.273 ms in that batch. Raw records and exact environment are in artifacts/evaluation.json and artifacts/evaluation.csv. These are limited fixture results, not general web-application performance claims. No manual data was supplied or invented; no superiority claim is made.

Repeat with `npm.cmd run evaluate -- 30`. For independent academic evidence, have a supervisor/tester review the oracle, then collect actual human design cases and timings using the documented controlled protocol.

## 8–9. Environment and startup

Required: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. No service-role credential. From this workspace:

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# Edit .env.local with the intended development database URL/key.
# With Docker available, for local Supabase:
npm.cmd exec supabase -- start
npm.cmd exec supabase -- migration up --local
npm.cmd exec supabase -- migration list --local
npm.cmd run dev
```

Open http://localhost:3000. Alternatively, manually apply the migration SQL to a new authorized development project and use its URL/key. See deployment-guide.md. Do not rerun the non-idempotent initial migration on an already migrated database.

## 10. Deployment

Complete the two-user database suite and authenticated browser workflow first. Review source and lockfile, then with permission push to GitHub and import into Vercel using Next.js, npm ci and npm run build. Set the two public Supabase variables, configure Auth URLs/email, apply the reviewed migration only to the approved target, deploy a preview and smoke-test ownership and exports before promotion. No deployment is claimed.

## 11. Known limitations

Live SQL/RLS/persistence are unverified here. Single-field EP/BVA does not cover cross-field state/workflow logic or execute cases against arbitrary external applications. Email is a documented ASCII subset; numeric bounds/precision and request/generation sizes are bounded. Common shared semantic errors remain possible despite independent assertions and a separate oracle. Listing limits and production rate-limit/monitoring needs are documented. Manual timing is a current-tab interval with participant protocol notes, not independently certified human activity. Owners can modify their own Data API records; this is not a tamper-proof archive.

## 12. Dissertation evidence

Capture the exact title, requirement creation and rejection, 7/8/12/20/21 password cases, decimal/date examples, validation and mutation evidence, matrix, persisted database rows, two-user isolation, history reopening, real exports, benchmark raw runs, actual manual records, complete test logs and preview build evidence. Use research-evidence-checklist.md for Chapter Four/Five details and retain the Git/version/environment identity with every result.
