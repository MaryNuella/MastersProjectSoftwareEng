# Testing strategy

Unit tests run with the lightweight built-in Node test runner. No external test framework is needed. Fixtures are deterministic and do not touch any database. Tests assert real boundaries, decimal/step semantics, leap-day operations, formats, contradictory definitions, independent mutation detection, logical duplicates, exports, metric counterexamples and nonnegative measured timings. Finite small-domain loops extend interval/length coverage without randomized tests.

```powershell
npm.cmd test
npm.cmd run build
$env:PLAYWRIGHT_CHANNEL='msedge' # if using installed Edge
npm.cmd run test:e2e
```

Install Chromium if needed: `npm.cmd exec playwright -- install chromium`. The public Playwright test checks landing navigation, documentation, and API authentication denial. The full workflow is explicitly skipped unless a disposable test database is configured. A skip is not a successful integration result.

## Opt-in Supabase integration

Use a separate local Supabase stack (Docker required) or a disposable hosted test project. Apply the supplied migration and create two confirmed users. Never set TEST_ALLOW_DATABASE_WRITES against production. Integration writes use UUID-prefixed TEST projects and remove them in finally; cleanup cascades all owned fixtures. No service-role key is used.

Create .env.test (ignored) containing:

```dotenv
TEST_ALLOW_DATABASE_WRITES=true
TEST_SUPABASE_URL=http://127.0.0.1:54321
TEST_SUPABASE_PUBLISHABLE_KEY=your-local-key
TEST_USER_EMAIL=tester-a@example.test
TEST_USER_PASSWORD=your-test-password
TEST_OTHER_EMAIL=tester-b@example.test
TEST_OTHER_PASSWORD=your-second-test-password
```

Run `node --env-file=.env.test --test tests/integration/*.test.js`. Tests check live requirement and constraint persistence, generation/session/case persistence, saved findings, matrix queries, exports, validation replacement, rollback after an invalid FK, two-user read/write isolation and snapshot retention after live deletion. If credentials are absent, one integration suite is reported skipped, never passed.

## Authenticated E2E

Set the application's .env.local URL/key to the same disposable project, build it, then run the Playwright CLI with .env.test loaded:

```powershell
npm.cmd run build
node --env-file=.env.test node_modules/@playwright/test/cli.js test
```

Full workflow: sign in, create project, submit contradictory constraints and observe rejection, save corrected password requirement, generate, revalidate, inspect matrix, download CSV and reopen history. The fixture cleanup deletes only the project created by this test. Browser tests must never point to production. If failure occurs before project selection, inspect TEST-E2E projects in the disposable test dashboard and remove stranded fixtures. Traces on failure are under test-results and should not be publicly committed because they may contain test-session tokens.

## Remaining verification boundary

Without Docker/local PostgreSQL or Supabase credentials, SQL execution, live RLS behavior, transactional persistence and the signed-in browser workflow cannot be verified. Documentation and SQL review do not substitute for those tests. Run both opt-in suites after configuration and retain the actual logs before dissertation claims or controlled deployment.
