import { assess } from "./semantics.js";
import { day, constraintsOf } from "./requirements.js";
import { applicable, RULES, RULE_VERSION } from "./rules.js";
export function conditions(r) {
  const c = r.constraints,
    items = [];
  const add = (objective, rule, key, match) =>
    items.push({
      id: `${r.id}/${objective}`,
      objective,
      ruleId: rule,
      constraintId: `${r.id}:${key}`,
      match,
    });
  add(
    "valid",
    "EP-VALID",
    "type",
    (v) =>
      assess(r, v).valid &&
      (v !== "" || (!r.required && c.maxLength === 0)) &&
      v !== null,
  );
  add("empty", "EP-EMPTY", "required", (v) => v === "");
  add("wrong-type", "EP-TYPE", "type", (v) =>
    assess(r, v).violations.includes(`${r.id}:type`),
  );
  if (r.type === "boolean")
    for (const v of [true, false])
      add(`boolean-${v}`, "EP-BOOLEAN", "type", (x) => x === v);
  if (r.type === "enum") {
    for (const v of c.allowedValues)
      add(`allowed:${v}`, "EP-ENUM", "allowedValues", (x) => x === v);
    add(
      "disallowed",
      "EP-ENUM",
      "allowedValues",
      (v) => typeof v === "string" && v !== "" && !c.allowedValues.includes(v),
    );
  }
  if (r.type === "email" || c.format)
    add("invalid-format", "EP-FORMAT", "format", (v) =>
      assess(r, v).violations.includes(`${r.id}:format`),
    );
  for (const key of ["minLength", "maxLength"])
    if (c[key] !== undefined)
      for (const delta of [-1, 0, 1])
        if (c[key] + delta >= 0)
          add(
            `${key}:${delta}`,
            "BVA-LENGTH",
            key,
            (v) => typeof v === "string" && [...v].length === c[key] + delta,
          );
  if (["integer", "decimal"].includes(r.type))
    for (const key of ["min", "max"])
      if (c[key] !== undefined)
        for (const delta of [-1, 0, 1]) {
          const scale = r.type === "decimal" ? 10 ** c.precision : 1;
          const target =
            (Math.round(c[key] * scale) +
              delta * Math.round((c.step ?? 1) * scale)) /
            scale;
          add(
            `${key}:${delta}`,
            "BVA-NUMBER",
            key,
            (v) => typeof v === "number" && Math.abs(v - target) < 1e-9,
          );
        }
  if (r.type === "decimal") {
    add("extra-precision", "EP-PRECISION", "precision", (v) =>
      assess(r, v).violations.includes(`${r.id}:precision`),
    );
    if (c.step > 10 ** -c.precision)
      add("off-step", "EP-PRECISION", "step", (v) =>
        assess(r, v).violations.includes(`${r.id}:step`),
      );
  }
  for (const key of ["minDate", "maxDate"])
    if (c[key])
      for (const delta of [-1, 0, 1])
        add(
          `${key}:${delta}`,
          "BVA-DATE",
          key,
          (v) => v === day(c[key], delta),
        );
  return items;
}
function canonical(v) {
  if (v === undefined) return "undefined";
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v)
    .sort()
    .map((k) => JSON.stringify(k) + ":" + canonical(v[k]))
    .join(",")}}`;
}
export function duplicates(cases) {
  const groups = new Map();
  for (const t of cases) {
    const key = canonical([
      t.requirementId,
      t.input,
      [...(Array.isArray(t.constraintIds) ? t.constraintIds : [])].sort(),
      t.expectedValid,
      t.expectedResult,
      t.objective,
    ]);
    const group = groups.get(key) ?? [];
    group.push(t.id);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((a) => a.length > 1)
    .map((ids) => ({
      ids,
      reason:
        "Same requirement, canonical input, covered constraints, outcome and objective",
    }));
}
export function validate(requirements, cases) {
  const map = new Map(requirements.map((r) => [r.id, r])),
    findings = [],
    idCounts = new Map();
  for (const t of cases) idCounts.set(t.id, (idCounts.get(t.id) ?? 0) + 1);
  for (const t of cases) {
    const messages = [],
      r = map.get(t.requirementId);
    if (!r) messages.push("Originating requirement does not exist");
    if (idCounts.get(t.id) > 1) messages.push("Test case ID is not unique");
    const mandatory = [
      "id",
      "requirementId",
      "sessionId",
      "title",
      "description",
      "category",
      "technique",
      "preconditions",
      "steps",
      "expectedResult",
      "constraintIds",
      "ruleId",
      "ruleVersion",
      "objective",
      "generatedAt",
    ];
    for (const key of mandatory)
      if (
        t[key] === undefined ||
        t[key] === null ||
        t[key] === "" ||
        (Array.isArray(t[key]) && !t[key].length)
      )
        messages.push(`Missing metadata: ${key}`);
    for(const key of mandatory.filter(k=>!['steps','preconditions','constraintIds'].includes(k)))
      if(typeof t[key]!=='string'||!t[key].trim()) messages.push(`Metadata must be a nonempty string: ${key}`);
    for(const key of ['steps','preconditions','constraintIds'])
      if(Array.isArray(t[key])&&t[key].some(v=>typeof v!=='string'||!v.trim())) messages.push(`Metadata array must contain nonempty strings: ${key}`);
    if (!Object.hasOwn(t, "input") || typeof t.expectedValid !== "boolean")
      messages.push("Missing input or expected validity");
    if (!["positive", "negative", "boundary"].includes(t.category))
      messages.push("Invalid category");
    if (
      !Array.isArray(t.steps) ||
      !Array.isArray(t.preconditions) ||
      !Array.isArray(t.constraintIds)
    )
      messages.push("Steps, preconditions and constraint IDs must be arrays");
    if (!Number.isFinite(Date.parse(t.generatedAt)))
      messages.push("Invalid generation timestamp");
    if (r) {
      const actual = assess(r, t.input);
      if (
        actual.valid !== t.expectedValid ||
        t.expectedResult !==
          (actual.valid ? r.validBehaviour : r.invalidBehaviour)
      )
        messages.push(
          "Expected outcome disagrees with independent constraint evaluation",
        );
      if (
        (t.category === "positive" && !actual.valid) ||
        (t.category === "negative" && actual.valid)
      )
        messages.push("Category disagrees with input validity");
      const condition = conditions(r).find(
        (c) => c.objective === t.objective && c.ruleId === t.ruleId,
      );
      if (!condition || !condition.match(t.input))
        messages.push("Input does not satisfy the claimed test objective");
      if (
        condition &&
        (!Array.isArray(t.constraintIds) ||
          !t.constraintIds.includes(condition.constraintId) ||
          t.constraintIds.length !== 1)
      )
        messages.push(
          "Claimed condition must identify its single matching constraint target",
        );
      const ids = new Set(constraintsOf(r).map((c) => c.id));
      if (r.type === "email") ids.add(`${r.id}:format`);
      if (
        Array.isArray(t.constraintIds) &&
        t.constraintIds.some((id) => !ids.has(id))
      )
        messages.push("Unknown constraint target");
      if (
        !applicable(t.ruleId, r) ||
        t.ruleVersion !== RULE_VERSION ||
        t.technique !== RULES[t.ruleId]?.technique
      )
        messages.push("Unknown, incompatible or mismatched generation rule");
      if (
        (t.category === "boundary") !==
        (typeof t.ruleId === "string" && t.ruleId.startsWith("BVA-"))
      )
        messages.push("Boundary category and boundary rule must agree");
    }
    findings.push({
      caseId: t.id,
      status: messages.length ? "Failed" : "Passed",
      messages: messages.length ? messages : ["Independent checks passed"],
    });
  }
  const good = new Set(
    findings.filter((f) => f.status === "Passed").map((f) => f.caseId),
  );
  const traceability = requirements.map((r) => {
    const own = cases.filter((t) => t.requirementId === r.id),
      all = conditions(r),
      covered = all
        .filter((c) =>
          own.some(
            (t) =>
              good.has(t.id) &&
              t.objective === c.objective &&
              t.ruleId === c.ruleId &&
              c.match(t.input),
          ),
        )
        .map((c) => c.id);
    return {
      requirementId: r.id,
      description: r.description,
      constraints: constraintsOf(r),
      caseIds: own.map((t) => t.id),
      rules: [...new Set(own.map((t) => t.ruleId))],
      covered,
      uncovered: all.map((c) => c.id).filter((id) => !covered.includes(id)),
      status:
        own.length &&
        covered.length === all.length &&
        own.every((t) => good.has(t.id))
          ? "Passed"
          : "Failed",
    };
  });
  const duplicateGroups = duplicates(cases),
    missing = traceability.flatMap((t) => t.uncovered),
    passed = findings.filter((f) => f.status === "Passed").length;
  const summary = {
    total: cases.length,
    passed,
    failed: cases.length - passed,
    missingConditions: missing,
    duplicateCases: duplicateGroups.reduce((n, g) => n + g.ids.length - 1, 0),
    traceabilityStatus:
      cases.every((t) => map.has(t.requirementId)) &&
      traceability.every((t) => t.caseIds.length)
        ? "Passed"
        : "Failed",
  };
  return {
    summary,
    findings,
    duplicateGroups,
    traceability,
    checks: [
      {
        name: "Completeness",
        status: missing.length ? "Failed" : "Passed",
        messages: missing,
      },
      {
        name: "Duplicates",
        status: duplicateGroups.length ? "Warning" : "Passed",
      },
      {
        name: "Boundary applicability",
        status: requirements.some((r) =>
          Object.keys(r.constraints).some((k) =>
            [
              "min",
              "max",
              "minLength",
              "maxLength",
              "minDate",
              "maxDate",
            ].includes(k),
          ),
        )
          ? "Passed"
          : "Not applicable",
      },
    ],
  };
}
