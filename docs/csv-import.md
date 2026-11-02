# CSV imports and research provenance

Requirements and Test repository each provide **Import CSV** and **Download CSV template**. Choose an active project, select a UTF-8 .csv file, preview, fix every invalid row, explicitly check the confirmation box and choose Confirm import. Preview never saves. The server repeats validation during confirmation and rejects a changed preview; saving uses one atomic database RPC. Invalid rows are not silently skipped. Existing generated records are never replaced or merged with manual imports.

The functions in `20261102123737_atomic_csv_imports.sql` have been applied with approval to gnfktaxebbdklmjlrdgy, history has been reconciled, and limited hosted verification passed with exact-record cleanup. No additional database change is required. The frontend/API implementation remains local pending a separately approved release. Do not rerun the migration. See delivery-status.md for actual outcomes and csv-import-migration.md for the function contracts.

## Requirement format

Exactly these case-sensitive headers are required, in any order, without extras or duplicates:

```csv
title,description,fieldName,type,required,validBehaviour,invalidBehaviour,constraints
Password policy,Required password of 8-20 characters,password,password,true,Accept input,Reject input,"{""minLength"":8,""maxLength"":20}"
```

`required` is true or false, not 1/0. `constraints` is a JSON object, escaped using CSV double quotes. The existing `normalizeRequirement` server logic validates supported types, text and constraints; the RPC adds defensive checks. Supported types remain text, password, email, integer, decimal, date, enum and boolean. No new semantics/rules are introduced. IDs, project ownership and timestamps are assigned by the server, not imported.

A batch accepts at most 50 rows. Duplicate normalized definitions, ignoring identity/timestamps, are rejected both within the file and against the selected project. Similar definitions with different titles/descriptions are not universally identical; review them before confirmation. Legacy/direct owner writes are outside the new RPC serialization protocol.

## Manual case format

```csv
requirementRef,title,input,expectedValid,expectedResult,category,objective
password,Minimum password boundary,"""12345678""",true,Accept input,boundary,minLength:0
```

All seven headers are required. `requirementRef` matches an existing requirement UUID or unique fieldName in the selected project. If multiple requirements share that field name, use the preview dropdown to select the intended requirement, then preview again. Foreign-owner/project IDs cannot be mapped.

`input` is a JSON scalar: a string must include JSON quotes (doubled again inside a quoted CSV cell); numbers such as -1 are JSON numbers, booleans true/false are native values, and null represents absence. Objects/arrays and nonfinite numbers are rejected. Strings are limited to 2048 characters. `expectedValid` must be true/false, `expectedResult` is the author's expected behaviour, category is positive/negative/boundary, and objective is a declared condition such as valid, empty, wrong-type, minLength:0 or maxLength:1. These claims are not assumed correct. A structurally valid but semantically wrong case can be imported, then fail explicit independent manual checks.

At most 2500 cases referencing 50 owned requirements are accepted per manual import. A new snapshot session is created with source manual_csv and Unvalidated status. It has no invented generation timestamp, technique, rule assignment, core-generation duration or experimental result. Existing generated sessions retain their provenance and content. Manual duplicates compare requirementId, typed input, expectedValid, expectedResult, category and objective, ignoring title changes. Generated/manual input overlap is allowed because independent manual designs can legitimately select the same inputs.

## Validation, traceability and exports

Test repository, Validation, Traceability and History identify manual_csv sessions. Coverage and redundancy show Not assessed until checks are explicitly requested. Traceability links to the saved requirement snapshot without claiming a generation rule. Validate manual cases uses existing constraint assessment and declared-condition matching in a separate manual adapter. It checks expected outcomes, objectives and categories, reports missing conditions/duplicates and persists the assessment through the existing save_validation RPC. The generated-case validator and methodology remain unchanged.

A Passed manual finding means the documented manual constraint checks passed; it is not proof of external execution, full generated-case metadata completeness or general defect detection. JSON exports include source and assessment scope. CSV exports include source per row. Unvalidated and assessed statuses are exported explicitly. Generation fields are not manufactured to satisfy a schema. Import templates and evidence exports serve different purposes: existing case exports contain additional metadata, so use the import template rather than assuming an evidence export is a round-trip import file.

Manual comparison is still controlled by the existing Evaluation protocol: actual design duration, participant/protocol notes and cases authored for the comparison specification. The import does not start a timer, transfer cases automatically, remap project references into benchmark IDs, create an evaluation or claim a speed/correctness advantage. Do not relabel an imported project case as a benchmark case without genuine specification correspondence.

## File and transactional safety

Files must be UTF-8 .csv, at most 180000 raw bytes. The existing API also limits the entire serialized JSON request to 256 KiB, and each RPC limits JSONB row data to 256 KiB; unusually heavy quoting can reach the request cap earlier. Quoted commas, double-quote escapes, BOM and quoted newlines are supported. Blank data rows, incorrect column counts, unclosed quotes, duplicate/unsupported headers, unsupported files, controls and unsafe JSON properties reject the import or mark the row invalid. Text beginning with spreadsheet formula-like prefixes is rejected; negative numeric JSON input remains allowed. Evidence CSV export retains existing formula neutralization.

All rows must pass preview and explicit confirmation. Any duplicate, foreign reference, invalid later row or competing duplicate batch detected by SQL aborts the entire save. Existing auth bearer verification and RLS apply. A project row lock serializes the two new RPCs; it does not add universal uniqueness against arbitrary legacy/direct owner writes. Owners can edit their own records under existing policies, so provenance is not a tamper-proof archive.

## Local verification commands

```powershell
npm.cmd test
node scripts/test-csv-pg17.mjs # requires pinned tools installation described in csv-import-migration.md
npm.cmd run build
$env:PLAYWRIGHT_CHANNEL='msedge'
node node_modules/@playwright/test/cli.js test --grep-invert 'complete authenticated research workflow'
```

The filtered browser command excludes the live authenticated write workflow. Its CSV fixture blocks production Supabase requests and runs against local isolated SQL. Do not run the live write suite or apply the migration without explicit authorization.
