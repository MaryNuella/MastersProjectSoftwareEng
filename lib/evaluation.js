import { assess } from "./semantics.js";
import { validate } from "./validation.js";
import { timedGeneration } from "./generator.js";
import { RULE_VERSION } from "./rules.js";
export function metrics(requirements, cases, references) {
  const report = validate(requirements, cases),
    byId = new Map(requirements.map((r) => [r.id, r]));
  const passed = new Set(
    report.findings.filter((f) => f.status === "Passed").map((f) => f.caseId),
  );
  const covered = references.filter((ref) =>
    cases.some((t) => {
      if (
        t.requirementId !== ref.requirementId ||
        t.objective !== ref.objective ||
        t.expectedValid !== ref.valid ||
        !passed.has(t.id)
      )
        return false;
      const r = byId.get(t.requirementId);
      if (ref.objective === "valid")
        return assess(r, t.input).valid && t.input !== "";
      if (
        [
          "wrong-type",
          "invalid-format",
          "disallowed",
          "extra-precision",
          "off-step",
        ].includes(ref.objective)
      )
        return !assess(r, t.input).valid;
      return JSON.stringify(t.input) === JSON.stringify(ref.input);
    }),
  );
  const correct = cases.filter((t) => {
    const r = byId.get(t.requirementId);
    return (
      r &&
      assess(r, t.input).valid === t.expectedValid &&
      t.expectedResult ===
        (t.expectedValid ? r.validBehaviour : r.invalidBehaviour) &&
      report.findings.find((f) => f.caseId === t.id)?.status === "Passed"
    );
  }).length;
  return {
    requiredConditions: references.length,
    coveredConditions: covered.length,
    coverage: references.length
      ? (covered.length / references.length) * 100
      : null,
    assessed: cases.length,
    correct,
    correctness: cases.length ? (correct / cases.length) * 100 : null,
    redundant: report.summary.duplicateCases,
    duplicationRate: cases.length
      ? (report.summary.duplicateCases / cases.length) * 100
      : null,
    missingReferenceIds: references
      .filter((r) => !covered.includes(r))
      .map((r) => r.id),
  };
}
export function experiment(
  dataset,
  { repetitions = 10, manual = null, environment = "Unspecified" } = {},
) {
  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 100)
    throw new Error("Repetitions must be 1–100");
  const runs = [];
  for (let i = 0; i < repetitions; i++) {
    const generated = timedGeneration(dataset.requirements, `benchmark-${i}`);
    runs.push({
      iteration: i + 1,
      coreDurationMs: generated.coreDurationMs,
      ...metrics(dataset.requirements, generated.cases, dataset.references),
    });
  }
  return {
    datasetVersion: dataset.version,
    ruleVersion: RULE_VERSION,
    environment,
    createdAt: new Date().toISOString(),
    sampleSize: dataset.requirements.length,
    repetitions,
    runs,
    manual,
  };
}
