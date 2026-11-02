# Atomic CSV import functions - local proposal

Status: applied to Miva SE Project (`gnfktaxebbdklmjlrdgy`) with explicit approval on 2 November 2026. Supabase initially recorded 20261102135912; supported CLI migration repair reconciled history to local version 20261102123737 without rerunning SQL. Subsequent explicitly authorized hosted CSV verification passed and all disposable records were cleaned up; see delivery-status.md. The preparation details and approval gates below document the earlier implementation checkpoint. Do not rerun this migration.

Migration: `supabase/migrations/20261102123737_atomic_csv_imports.sql`, created with the existing Supabase CLI's `migration new` command. It creates exactly two SECURITY INVOKER functions with empty search_path, revokes PUBLIC/anon execution and grants authenticated execution. No existing function, table, column, policy or record is altered by applying the migration. The original migration is unchanged.

## Contracts

These functions accept parsed JSON rows, **not raw CSV or uploaded files**. The CSV parser, downloadable templates, preview, explicit confirmation, authenticated API handlers and UI are now implemented locally; see csv-import.md. The future server must apply existing `normalizeRequirement` plus file, header, encoding and CSV validation before calling the RPC. SQL adds defensive structural, type and constraint checks so direct RPC calls do not rely solely on browser validation. No new requirement type or generation rule is added.

### import_requirements_csv(p_project uuid, p_rows jsonb)

Accepts 1-50 requirement objects, at most 262144 bytes of JSONB text. Each row has exactly the following supported keys:

```json
{"title":"Password policy","description":"Required password of 8-20 characters","fieldName":"password","type":"password","required":true,"validBehaviour":"Accept","invalidBehaviour":"Reject","constraints":{"minLength":8,"maxLength":20}}
```

Other supported types/constraints follow the existing normalizer. The function validates text, flags, allowed constraint keys, bounds, formats, precision/step, dates, enum uniqueness and representable intervals. Decimal default step is normalized. It trims definition text, creates server UUIDs, attaches the selected project, then calls the existing save_requirement in insert-only mode. IDs, owner fields, timestamps and other unexpected properties are rejected. Return value contains `imported` and saved `requirements`.

Exact normalized definitions already present in the project, ignoring identity/timestamps, are rejected. Repeated rows inside a batch also reject the whole batch. Same field names with different definitions are not universally considered duplicates: such definitions may represent different intended requirements. No existing requirement is updated or replaced.

### import_manual_cases_csv(p_project uuid, p_rows jsonb)

Accepts 1-2500 manual cases, at most 262144 bytes of JSONB text, referencing at most 50 existing requirements owned by the caller **in the selected project**. Required row keys:

```json
{"requirementId":"<existing owned requirement UUID>","title":"Minimum password boundary","input":"12345678","expectedValid":true,"expectedResult":"Accept","category":"boundary","objective":"minLength:0"}
```

`input` must be a JSON scalar (including explicit null), not an object or array. String inputs are limited to 2048 characters; numeric inputs must fit the JavaScript numeric representation. Categories are positive/negative/boundary. Expected validity, outcome and objective are author claims: acceptance is not proof that they are correct. A wrong expected outcome can be stored, but remains Unvalidated. IDs, provenance and generation metadata are not accepted from the caller.

Each import creates a **new separate session**, requirement snapshots, new case records, Unvalidated finding placeholders and traceability mappings. The session and cases have server-assigned `source: manual_csv`, importedAt and `validationStatus: Unvalidated`. Findings/mappings also carry manual provenance. No generated records are appended to, overwritten or deleted. The session's required rule_version FK points to existing catalogue 1.0.0 only as an assessment compatibility reference; payload calls this assessmentRuleVersion. It is not a claim that rules generated these cases.

No generatedAt, generation technique, ruleId, case ruleVersion or coreDurationMs is invented. Session validation is null; no independently passing findings or condition-coverage claims are created. Traceability links identify snapshots/cases but carry no inferred rules or covered conditions. Return value contains session id, source, status, count, snapshots and cases.

Duplicates are matched across prior manual imports in the same project using requirementId, input, expectedValid, expectedResult, category and objective. Changing a title does not bypass duplicate rejection. Existing generated cases are deliberately excluded from manual duplicate checks because separately authored comparison evidence may share the same inputs. No benchmark dataset, evaluation run, manual timer, protocol note or metric is inserted by either function.

## Transactions, ownership and limits

Both functions require auth.uid(), lock the selected owned project FOR UPDATE, and execute as the caller under existing RLS. Ownership/project checks precede writes. Manual snapshots additionally lock referenced requirements FOR SHARE while copying their definitions. The functions contain no exception handlers that swallow errors: an invalid later row, missing requirement, conflict or duplicate rolls back all earlier inserts in the RPC statement.

The project lock serializes calls to these two RPCs within a project. It does not create a universal uniqueness constraint for existing direct table writes or the older single-row RPC. An owner can also edit their own data outside these functions under existing policies; this is not tamper-proof provenance. Do not claim global deduplication against arbitrary concurrent owner writes. Row and JSONB-text limits bound work, but parsing happens before RPC invocation: raw upload byte limits are also enforced in the browser/parser, with the existing API request-body cap remaining in effect.

## Local verification - completed continuation

- `npm.cmd test`: 52 passed, 0 failed; one native-concurrency test deliberately skipped under single-connection PGlite. This includes unchanged research tests, CSV/parser/server checks, SQL rollback/ownership/duplicate checks and service-to-SQL persistence/assessment/export checks.
- `node scripts/test-csv-pg17.mjs`: **18 passed, 0 failed, 0 skipped** on a new native PostgreSQL **17.11** loopback-only cluster. The script applied both migrations only to that new cluster. Separate connections verified project-lock waiting and duplicate rejection for requirement and manual-case imports, with one committed copy and no partial second batch. Rollback, RLS isolation, service preview/confirm/reload, manual assessment persistence and exports also passed.
- Playwright: 4 passed (isolated CSV workflow plus read-only landing/auth boundary, mobile and documentation/redirect checks). The CSV browser transport is intercepted and backed by local PGlite and the real import service/functions; production Supabase requests are blocked. This is not a claim of live PostgREST integration. It covers template download, pre-save preview, confirmation gating, duplicate preview, ambiguous-reference mapping, Unvalidated source labels, explicit manual checks, JSON export and history reopening.
- Production build passed. The live write suite was deliberately excluded. No production records, live migrations or Auth settings were accessed/changed during this continuation.

The pinned PGlite dev dependency remains for portable tests (PostgreSQL 18.6). Native tools are installed only in ignored artifacts. To reproduce native verification on Windows:

```powershell
npm.cmd install --prefix artifacts/pg17-tools --save-exact embedded-postgres@17.11.0-beta.19 --ignore-scripts --no-audit --no-fund
node scripts/test-csv-pg17.mjs
```

The runner never reads .env or an external database URL. It creates a new data directory, binds only 127.0.0.1 on a free port, checks PostgreSQL 17 and an isolated-cluster marker before running SQL, and stops the cluster in finally. Stopped fixtures remain under ignored artifacts; no recursive cleanup of arbitrary paths is performed. Tests use synthetic local auth users/roles, not real account credentials. Native PostgreSQL verification addresses the earlier major-version/concurrency limitation; it is not a full hosted Supabase-stack test.

## Approval gates before application/use

1. Review and separately approve **only** applying this prepared migration. No additional migration, table/column/policy change or change to existing database functions was needed. Do not rerun the original schema migration, reset or issue a blanket remote db push.
2. After approval/application, verify function visibility in the hosted API and perform an explicitly authorized disposable-record smoke test using the real PostgREST/auth stack. Preview works before application, but confirm returns a clear 503 migration-not-enabled response until the RPCs exist.
3. UI/history/validation/traceability/export handling is now source-aware. Manual sessions remain Unvalidated until an explicit manual assessment is saved with scope manual-constraint-checks/v1. This checks outcomes, claimed objectives/categories and declared EP/BVA conditions, not generated-case metadata or external execution. Existing generated-case validation is unchanged.
4. Manual comparison remains an explicit action through the documented measured-time/participant protocol. Import time is never human design time; imported project IDs are not automatically benchmark IDs. No import automatically creates an evaluation or favourable score.
5. Project locks guarantee duplicate checks across the two new RPCs, not arbitrary concurrent calls to legacy single-row APIs or direct owner writes. Existing owner-editable records are not tamper-proof research evidence. No broader uniqueness change is proposed.

The implementation is ready for review of the existing migration, subject to the hosted smoke test after separate application approval. Nothing has been committed, pushed, deployed or applied to the live project.
