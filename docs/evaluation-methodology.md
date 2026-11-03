# Reproducible experimental evaluation

Dataset 1.0.0 is benchmarks/dataset.json: ten representative field specifications and 78 explicitly specified reference conditions. Password, email, integer, decimal, date, optional text, enum, boolean, combined length/format and exclusive decimal bounds are included. Reference inputs and outcomes are written as a separate oracle table; the experiment runner never obtains them from generator output. For defensible external independence, ask a supervisor or second tester to review and sign off the table before collecting dissertation experiments. Do not claim blinded external authorship merely because it is a separate file.

## Protocol

1. Freeze the Git commit, lockfile, rule version and dataset version. Review every reference condition against its prose requirement. Retain the signed review sheet.
2. Record OS, CPU, Node/browser versions, memory, power mode, whether background workloads were controlled, and cold/warm-up policy.
3. Run `npm.cmd run evaluate -- 30`. The runner uses performance.now(), measures only normalization and core generation, and separately assesses cases afterward. Database, network, rendering and report/export I/O are excluded. No warm-up iterations are silently discarded. First iteration is cold and is retained. Each raw repetition is in artifacts/evaluation.json and artifacts/evaluation.csv.
4. Repeat independent batches if assessing timing variance. Report sample size, distribution, mean/median and spread; do not generalize a sub-millisecond local measurement to network response time or whole-system throughput.
5. For UI-recorded runs, choose a project and enter environment/protocol notes. The UI saves all repetitions to evaluation_runs and stores the full dataset snapshot separately.
6. Record real manual work using the timer. Show the same requirements, rule catalogue and case schema to participants, withhold generated outputs and reference answers until collection is complete, and document participant experience, order/counterbalancing, permitted tools, breaks and stopping criteria. Start before design and stop after completion. Paste the actual cases as JSON and add participant/protocol notes; the manual duration comes from that measured interval. Do not reload the tab during timing. Retain consent/anonymize participant identifiers as appropriate to university protocol.
7. Export raw cases and both metric reports. Compare the same condition set and apply the same duplicate and correctness assertions. Report missing manual data as missing. Make superiority claims only when supported by actual collected comparison data.

## Metrics

- Requirement-condition coverage = covered reference conditions / required reference conditions x 100. Method 2.0.0 requires source-neutral outcome, objective and category checks. String boundaries match the declared character-length condition, not the reference character sequence. Numeric/date boundaries, enum members, booleans and empty values retain exact reference-value matching. Other partitions accept a semantically passing representative.
- Semantic correctness (method 2.0.0) = cases passing requirement, expected validity/behaviour, objective and category assertions / assessed cases x 100. Manual and generated cases use the same assertions. Generation metadata is not required for this score. Each automated repetition additionally records generatedMetadataCertification from the unchanged generated-case validator; its scope includes the existing structural and semantic checks. It does not certify human authorship.
- Comparison duplication = sum(group size - 1) / assessed cases x 100. Groups use requirement identity, typed input, expected validity/behaviour and objective; generation-only constraint metadata is excluded for source neutrality. Duplicate cases cannot add reference coverage. Existing validation-page duplicate handling is unchanged.
- Core generation time = monotonic end−start, milliseconds. Manual design time is actual elapsed design interval and includes the human's schema authoring. That difference in activity scope must be stated explicitly when interpreting the comparison.

Zero denominators produce null rather than a fabricated 0 or 100. No favourable scores are hardcoded. Missing cases lower coverage; altered outcomes lower correctness; copied cases raise redundancy. Unit tests verify these counterexamples.

## Threats to validity

Ten single-field benchmarks are a limited sample, not the entire web-application domain. Shared constraint semantics can cause common-mode errors. Oracle review is necessary. Same-computer timings depend on runtime warm-up and background load. Human participants may learn from earlier tasks. Test design completeness here means declared EP/BVA conditions, not branch coverage, application code coverage or defect detection effectiveness. No target application is automatically exercised by generated designs. Do not conflate these measurements.

## JSON exports

All export envelopes use schema `research-framework/1.0`: kind, exportedAt (ISO UTC), metadata (sessionId/ruleVersion when applicable), and data (array). Cases carry every generated field plus validationStatus. Validation exports carry caseId/status/messages. Matrix exports contain requirementId, description, constraints, caseIds, rules, covered/uncovered and status. Evaluation JSON includes complete repetitions, dataset/rule version, environment, time, sample size and optional measured manual data. Evaluation CSV preserves nested runs/manual data as JSON cells; CLI evaluation.csv offers one flat row per repetition. CSV uses quoted cells, doubled embedded quotes, CRLF, UTF-8 BOM, and a leading apostrophe for spreadsheet formula-like prefixes.

## Evaluation method version 2.0.0

Future runs record evaluationMethodVersion 2.0.0 and assessmentScope source-neutral-semantics/v2. Historical records are displayed under their original method and are never recalculated or rewritten. Do not pool scores across methods without disclosure. Manual submissions must use the frozen benchmark requirement identities and specifications; project CSV cases are not automatically remapped. Preserve manual_csv source labels. Generation timestamps, techniques and rule metadata must not be invented for human submissions. Import provenance proves neither human authorship nor independent oracle review. Record actual participant activity and design intervals separately. Shared constraint semantics and the need for external oracle review remain limitations.
