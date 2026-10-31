# Delivery status — 30 October 2026

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
