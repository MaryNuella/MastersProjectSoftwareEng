import { assess } from "./semantics.js";
import { validate, duplicates } from "./validation.js";
import { semanticMessages } from "./manual-cases.js";
import { timedGeneration } from "./generator.js";
import { RULE_VERSION } from "./rules.js";
export function metrics(requirements, cases, references) {
  const byId = new Map(requirements.map((r) => [r.id, r]));
  const passed = new Set(cases.filter(t => !semanticMessages(byId.get(t.requirementId), t).length));
  // Comparison redundancy cannot depend on generation-only constraint metadata.
  const duplicateGroups = duplicates(cases.map((t, i) => ({ ...t, id: String(i), constraintIds: [] })));
  const redundant = duplicateGroups.reduce((n, g) => n + g.ids.length - 1, 0);
  const covered = references.filter((ref) =>
    cases.some((t) => {
      if (
        t.requirementId !== ref.requirementId ||
        t.objective !== ref.objective ||
        t.expectedValid !== ref.valid ||
        !passed.has(t)
      )
        return false;
      const r = byId.get(t.requirementId);
      if (/^(minLength|maxLength):(-1|0|1)$/.test(ref.objective))
        return true; // semantic assessment already matched the exact length condition
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
      passed.has(t)
    );
  }).length;
  return {
    assessmentScope: "source-neutral-semantics/v2",
    requiredConditions: references.length,
    coveredConditions: covered.length,
    coverage: references.length
      ? (covered.length / references.length) * 100
      : null,
    assessed: cases.length,
    correct,
    correctness: cases.length ? (correct / cases.length) * 100 : null,
    redundant,
    duplicationRate: cases.length
      ? (redundant / cases.length) * 100
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
    const certification = validate(dataset.requirements, generated.cases);
    runs.push({
      iteration: i + 1,
      coreDurationMs: generated.coreDurationMs,
      ...metrics(dataset.requirements, generated.cases, dataset.references),
      generatedMetadataCertification: {
        scope: "existing-generated-case-validation/v1",
        assessed: certification.summary.total,
        passed: certification.summary.passed,
        failed: certification.summary.failed,
      },
    });
  }
  return {
    evaluationMethodVersion: "2.0.0",
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
