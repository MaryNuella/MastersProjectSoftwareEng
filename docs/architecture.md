# Architecture and objective mapping

The project keeps its approved title and five research objectives. The application and experiment runner use JavaScript. Benchmark specifications and reference conditions are checked-in static JSON.

| Objective                                         | Implementation                                                                                     | Evidence                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1. Analyse testing rules                          | requirements.js, rules.js, documented supported semantics                                          | Rule catalogue; contradictory-definition tests            |
| 2. Generate positive, negative and boundary cases | generator.js, deterministic ordering and fixed representatives                                     | Unit tests and saved generation sessions                  |
| 3. Independently validate                         | validation.js, semantic outcome checks, independently enumerated conditions, duplicate detector    | Mutation tests, findings, matrix                          |
| 4. Evaluate against reference cases               | benchmarks/dataset.json, evaluation.js                                                             | Versioned oracle and raw runs                             |
| 5. Compare automated/manual design                | Coverage, correctness, redundancy and monotonic timings; optional actual manual interval and cases | Raw measurements, protocol notes; no invented manual data |

```mermaid
flowchart LR
 Browser[React and Tailwind workspace] --> Auth[Supabase Auth]
 Browser --> API[Next.js Route Handlers]
 API --> Req[Strict requirement definitions]
 API --> Gen[Pure deterministic generator]
 API --> Val[Independent assertions and completeness]
 Gen --> Sem[Shared declarative constraint semantics]
 Val --> Sem
 API --> Eval[Evaluation and independent reference oracle]
 API --> Export[CSV and JSON]
 API --> DB[(Supabase PostgreSQL with owner RLS)]
```

```mermaid
flowchart LR
 Researcher((Researcher)) --> Projects[Manage projects]
 Researcher --> Requirements[Create / edit / delete requirements]
 Researcher --> Generate[Generate and reopen sessions]
 Researcher --> Validate[Validate and inspect duplicates]
 Supervisor((Supervisor as account holder)) --> Inspect[Inspect matrix and evidence]
 Researcher --> Inspect
 Researcher --> Evaluate[Run benchmarks and measure manual work]
 Researcher --> Export[Export evidence]
```

```mermaid
flowchart TD
 A[Create project] --> B[Define typed requirement]
 B --> C{Strict server validation}
 C -->|Reject| B
 C -->|Accept| D[Save requirement and normalized constraints transactionally]
 D --> E[Select up to 50 requirements]
 E --> F[Generate fixed ordered cases]
 F --> G[Independently assess cases and condition coverage]
 G --> H[Save session, snapshots, cases, findings and traceability atomically]
 H --> I[Inspect / reopen / export]
```

The application generates test designs for field requirements. Playwright tests this application's principal workflow; the system does not automatically execute generated field cases against arbitrary target websites. One field is modeled per requirement; cross-field, business workflow, state transition and combinatorial testing are outside rule version 1.0.0.

The frontend uses Supabase Auth sessions and sends the access token in an Authorization header. The backend verifies it using getUser and creates a database client with that same user token. No service-role key is required. RLS and composite ownership foreign keys are the final isolation boundary. Bearer authentication avoids ambient-cookie CSRF; production must still guard against XSS and use HTTPS.
