# Rule-Based Automated Test Case Generation and Validation Framework

**Design and Implementation of a Rule-Based Automated Test Case Generation and Validation Framework for Web Applications**

Master of Information Technology research, MIVA Open University. Deterministic JavaScript implementation; no AI, ML, random data, or probabilistic generation is used by the application.

## Start locally (PowerShell)

```powershell
npm.cmd ci
Copy-Item .env.example .env.local
# Edit .env.local: Supabase URL and publishable key.
# Apply the migration to your local/disposable database; see docs/deployment-guide.md.
npm.cmd run dev
```

Open http://localhost:3000. Without Supabase configuration, the landing page, documentation and sign-in setup instructions work; authenticated storage operations require Supabase. There is no fake persistence fallback.

```powershell
npm.cmd test
npm.cmd run test:integration
npm.cmd run build
$env:PLAYWRIGHT_CHANNEL='msedge' # Optional installed-browser alternative to playwright install chromium
npm.cmd run test:e2e
npm.cmd run evaluate -- 30
```

## Layout

```text
app/                 App Router pages and authenticated Route Handler
components/          Responsive research workspace
lib/                 Requirement schema, semantics, rule engine, validation, exports, evaluation
lib/server/          Token authentication and Supabase repository operations
benchmarks/          Versioned requirements and independently authored reference conditions
supabase/            Schema source and CLI-created migrations
tests/               Unit, opt-in Supabase integration, Playwright workflow tests
scripts/             Reproducible benchmark runner
docs/                Architecture, methodology, setup, operation and research evidence
artifacts/           Generated raw experiment files (Git-ignored)
```

Read [delivery status](docs/delivery-status.md), [deployment](docs/deployment-guide.md), [user manual](docs/user-manual.md), and [research evidence checklist](docs/research-evidence-checklist.md). No remote migration, deployment or GitHub push is performed by these startup commands.
