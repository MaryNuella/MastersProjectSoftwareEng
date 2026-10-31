# User manual

1. Open the application and enter the workspace. If a setup notice is shown, configure Supabase first (deployment-guide.md).
2. Create an account using a valid email and password, confirm email if configured, then sign in.
3. On Projects, enter a project title and create it. The active project selector persists across page navigation.
4. On Requirements, create one structured field requirement. Give a title, description, field name, type, required flag, constraints, and expected behaviours. The default editor is a password example. Save. Invalid JSON or contradictory/unsupported constraints display an error without saving.
5. To edit, choose Edit in the requirement list. Save updates the same ID. Delete removes the live requirement and constraints; earlier session snapshots remain available. IDs and timestamps are server-assigned.
6. On Generate cases, select the requirements and generate. A session records ordered cases, the immutable-by-application specification snapshot, the rule version, core duration and initial independent assessment. No random input is used.
7. On Test repository, filter by title/category/rule. Inspect metadata to see preconditions, execution steps, input, expected outcome, constraint and objective. Export cases, validation or traceability as CSV or JSON.
8. On Validation, click Validate cases to rerun independent assertions against the saved snapshots. Inspect passed/failed counts, missing conditions, traceability and duplicate groups. A failed completeness report can coexist with individually correct cases.
9. On Traceability, inspect requirement-to-case links, rule identifiers and covered/uncovered conditions. Current requirements absent from this session are explicitly listed. A requirement with no session has no coverage.
10. On History, reopen any of the latest 100 saved project sessions. Older snapshots retain their original definitions even after live edits/deletion.
11. On Evaluation, enter environment/protocol details and repetitions (1–100). Run the fixed benchmark. The table and bars reflect actual computed results. For manual comparison, start the timer, do the actual work, stop, paste the manual test case JSON and record protocol notes before running. Leaving manual timing empty saves no manual comparison.
12. Export each evaluation as JSON (full raw data) or CSV. For a flat per-repetition timing CSV, use the command-line experiment runner.

## Example defence

Create project “Defence demonstration”. Create required password field, minLength 8, maxLength 20, valid behaviour “Accept password”, invalid behaviour “Reject password with validation message”. Generate and show lengths 7, 8, 12, 20, 21. Show the applied BVA-LENGTH rule and originating requirement ID. Validate, show the matrix, export and reopen history. Run the ten-requirement benchmark, explain the actual metrics, and clearly distinguish them from any collected human comparison.

## Common errors

“Sign in to continue” or invalid session: sign in again. “Supabase is not configured”: set environment variables and restart/rebuild. “Database operation failed”: confirm migration, table grants, Auth user and RLS policies. “Project not found”: choose an owned project. “Minimum exceeds maximum”: correct constraints. JSON syntax errors: use double-quoted property names and no trailing commas. A blank list means no records were returned; the application does not substitute fabricated records.
