import { assess } from "./semantics.js";
import { conditions, duplicates } from "./validation.js";
import { RULE_VERSION } from "./rules.js";

// Does not synthesize generator metadata or call the generated-case validator.
export function validateManualCases(requirements, cases) {
  const map = new Map(requirements.map(r => [r.id, r]));
  const findings = cases.map(t => {
    const r = map.get(t.requirementId), messages = [];
    if (t.source !== "manual_csv") messages.push("Manual provenance is missing");
    if (!r) messages.push("Requirement snapshot is missing");
    else {
      const actual = assess(r, t.input);
      if (typeof t.expectedValid !== "boolean" || t.expectedValid !== actual.valid || t.expectedResult !== (actual.valid ? r.validBehaviour : r.invalidBehaviour)) messages.push("Expected outcome disagrees with independent constraint assessment");
      const condition = conditions(r).find(c => c.objective === t.objective);
      if (!condition || !condition.match(t.input)) messages.push("Input does not satisfy the claimed objective");
      if (!["positive", "negative", "boundary"].includes(t.category) || t.category === "positive" && !actual.valid || t.category === "negative" && actual.valid || (t.category === "boundary") !== Boolean(condition?.ruleId.startsWith("BVA-"))) messages.push("Category disagrees with the input or objective");
    }
    return { caseId: t.id, source: "manual_csv", status: messages.length ? "Failed" : "Passed", messages: messages.length ? messages : ["Manual input, expected outcome, objective and category independently checked; generation provenance not asserted"] };
  });
  const passed = new Set(findings.filter(f => f.status === "Passed").map(f => f.caseId));
  const traceability = requirements.map(r => {
    const own = cases.filter(t => t.requirementId === r.id), all = conditions(r);
    const covered = all.filter(c => own.some(t => passed.has(t.id) && t.objective === c.objective && c.match(t.input))).map(c => c.id);
    return { requirementId: r.id, source: "manual_csv", description: r.description, constraints: r.constraints, caseIds: own.map(t => t.id), rules: [], covered, uncovered: all.map(c => c.id).filter(id => !covered.includes(id)), status: own.length && covered.length === all.length && own.every(t => passed.has(t.id)) ? "Passed" : "Failed" };
  });
  const duplicateGroups = duplicates(cases);
  return { source: "manual_csv", scope: "manual-constraint-checks/v1", assessmentRuleVersion: RULE_VERSION, assessedAt: new Date().toISOString(),
    summary: { total: cases.length, passed: passed.size, failed: cases.length - passed.size, unvalidated: 0, missingConditions: traceability.flatMap(t => t.uncovered), duplicateCases: duplicateGroups.reduce((n, g) => n + g.ids.length - 1, 0), traceabilityStatus: traceability.every(t => t.caseIds.length) ? "Passed" : "Failed" }, findings, traceability, duplicateGroups,
    checks: [{ name: "Scope: manual constraint and objective checks; no generation-metadata certification", status: "Assessed" }] };
}

export function unvalidatedManualReport(requirements, cases) {
  return { source: "manual_csv", scope: "unvalidated", summary: { total: cases.length, passed: 0, failed: 0, unvalidated: cases.length, missingConditions: [], duplicateCases: 0, traceabilityStatus: "Unvalidated" },
    findings: cases.map(t => ({ caseId: t.id, source: "manual_csv", status: "Unvalidated", messages: ["Imported author claim; independent checks have not been run"] })),
    traceability: requirements.map(r => ({ requirementId: r.id, source: "manual_csv", description: r.description, constraints: r.constraints, caseIds: cases.filter(t => t.requirementId === r.id).map(t => t.id), rules: [], covered: [], uncovered: ["Not independently assessed"], status: "Unvalidated" })), duplicateGroups: [], checks: [{ name: "Manual import", status: "Unvalidated" }] };
}
