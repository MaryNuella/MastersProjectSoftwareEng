# Reproducible experimental evaluation

Dataset 1.0.0 is benchmarks/dataset.json: ten representative field specifications and 78 explicit reference conditions. Password, email, integer, decimal, date, optional text, enum, boolean, combined length/format and exclusive decimal bounds are included. Reference inputs and outcomes are written as a separate oracle table; the experiment runner never obtains them from generator output. For defensible external independence, ask a supervisor or second tester to review and sign off the table before collecting dissertation experiments. Do not claim blinded external authorship merely because it is a separate file.

## Protocol

1. Freeze the Git commit, lockfile, rule version and dataset version. Review every reference condition against its prose requirement. Retain the signed review sheet.
2. Record OS, CPU, Node/browser versions, memory, power mode, whether background workloads were controlled, and cold/warm-up policy.
3. Run `npm.cmd run evaluate -- 30`. The runner uses performance.now(), measures only normalization and core generation, and separately assesses cases afterward. Database, network, rendering and report/export I/O are excluded. No warm-up iterations are silently discarded. First iteration is cold and is retained. Each raw repetition is in artifacts/evaluation.json and artifacts/evaluation.csv.
4. Repeat independent batches if assessing timing variance. Report sample size, distribution, mean/median and spread; do not generalize a sub-millisecond local measurement to network response time or whole-system throughput.
5. For UI-recorded runs, choose a project and enter environment/protocol notes. The UI saves all repetitions to evaluation_runs and stores the full dataset snapshot separately.
6. Record real manual work using the timer. Show the same requirements, rule catalogue and case schema to participants, withhold generated outputs and reference answers until collection is complete, and document participant experience, order/counterbalancing, permitted tools, breaks and stopping criteria. Start before design and stop after completion. Paste the actual cases as JSON and add participant/protocol notes; the manual duration comes from that measured interval. Do not reload the tab during timing. Retain consent/anonymize participant identifiers as appropriate to university protocol.
7. Export raw cases and both metric reports. Compare the same condition set and apply the same duplicate and correctness assertions. Report missing manual data as missing. Make superiority claims only when supported by actual collected comparison data.

## Metrics

- Requirement-condition coverage = independently authored required conditions covered / required reference conditions ×100. A passed case must match the required objective and outcome. Boundary/enum/boolean/empty conditions match the explicit reference input; valid, invalid-format, invalid-type and precision partitions accept any independently passing representative of that condition. This avoids penalizing a human who chooses a different valid value. Reference fixture outcomes are additionally checked by unit tests.
- Correctness = assessed cases passing independent outcome, metadata, rule, objective and traceability assertions / all assessed cases ×100. Publish this operational definition: it includes structural test-design correctness, not only expected outcome accuracy.
- Duplication = redundant cases / all cases ×100. Redundant count is sum(group size−1), using the exact equivalence criteria in validation-methodology.md. Repeated values with different objectives are not redundant.
- Core generation time = monotonic end−start, milliseconds. Manual design time is actual elapsed design interval and includes the human's schema authoring. That difference in activity scope must be stated explicitly when interpreting the comparison.

Zero denominators produce null rather than a fabricated 0 or 100. No favourable scores are hardcoded. Missing cases lower coverage; altered outcomes lower correctness; copied cases raise redundancy. Unit tests verify these counterexamples.

## Threats to validity

Ten single-field benchmarks are a limited sample, not the entire web-application domain. Shared constraint semantics can cause common-mode errors. Oracle review is necessary. Same-computer timings depend on runtime warm-up and background load. Human participants may learn from earlier tasks. Test design completeness here means declared EP/BVA conditions, not branch coverage, application code coverage or defect detection effectiveness. No target application is automatically exercised by generated designs. Do not conflate these measurements.

## JSON exports

All export envelopes use schema `research-framework/1.0`: kind, exportedAt (ISO UTC), metadata (sessionId/ruleVersion when applicable), and data (array). Cases carry every generated field plus validationStatus. Validation exports carry caseId/status/messages. Matrix exports contain requirementId, description, constraints, caseIds, rules, covered/uncovered and status. Evaluation JSON includes complete repetitions, dataset/rule version, environment, time, sample size and optional measured manual data. Evaluation CSV preserves nested runs/manual data as JSON cells; CLI evaluation.csv offers one flat row per repetition. CSV uses quoted cells, doubled embedded quotes, CRLF, UTF-8 BOM, and a leading apostrophe for spreadsheet formula-like prefixes.
