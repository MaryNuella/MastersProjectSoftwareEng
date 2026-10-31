import { normalizeRequirement, numericLimits, day } from "./requirements.js";
import { assess } from "./semantics.js";
import { RULES, RULE_VERSION } from "./rules.js";
export function stringAt(r, n) {
  if (n < 0) return null;
  if (r.type === "email" || r.constraints.format === "email")
    return n >= 6 ? "a".repeat(n - 5) + "@b.co" : "a".repeat(n);
  return "a".repeat(n);
}
export function representative(r) {
  const c = r.constraints;
  if (["text", "password", "email"].includes(r.type))
    return stringAt(
      r,
      c.maxLength === 0
        ? 0
        : Math.max(
            r.type === "email" || c.format === "email" ? 6 : 1,
            c.minLength ?? 1,
            Math.min(12, c.maxLength ?? 12),
          ),
    );
  if (["integer", "decimal"].includes(r.type)) {
    const b = numericLimits(r);
    return Math.max(b.low, Math.min(b.high, 0)) / b.scale;
  }
  if (r.type === "date")
    return c.minDate
      ? day(c.minDate, c.minExclusive ? 1 : 0)
      : c.maxDate
        ? day(c.maxDate, c.maxExclusive ? -1 : 0)
        : "2024-06-15";
  if (r.type === "enum") return c.allowedValues[0];
  return true;
}
export function generate(
  raw,
  sessionId,
  { timestamp = new Date().toISOString() } = {},
) {
  const r = normalizeRequirement(raw),
    c = r.constraints,
    cases = [];
  function add(rule, objective, value, keys, category) {
    const result = assess(r, value),
      i = cases.length + 1;
    cases.push({
      id: `${sessionId}:${r.id}:${String(i).padStart(3, "0")}`,
      requirementId: r.id,
      sessionId,
      title: `${r.fieldName}: ${objective}`,
      description: `${RULES[rule].description}; objective ${objective}`,
      category: category ?? (result.valid ? "positive" : "negative"),
      technique: RULES[rule].technique,
      input: value,
      preconditions: [`Requirement ${r.id} is active`],
      steps: [
        `Enter ${JSON.stringify(value)} into ${r.fieldName}`,
        "Submit the form",
        "Observe validation behaviour",
      ],
      expectedValid: result.valid,
      expectedResult: result.valid ? r.validBehaviour : r.invalidBehaviour,
      constraintIds: keys.map((k) => `${r.id}:${k}`),
      ruleId: rule,
      ruleVersion: RULE_VERSION,
      objective,
      generatedAt: timestamp,
    });
  }
  add("EP-VALID", "valid", representative(r), ["type"]);
  add("EP-EMPTY", "empty", "", ["required"]);
  add(
    "EP-TYPE",
    "wrong-type",
    r.type === "boolean"
      ? "true"
      : ["integer", "decimal"].includes(r.type)
        ? "not-a-number"
        : r.type === "date"
          ? "2024-02-30"
          : 42,
    ["type"],
  );
  if (r.type === "boolean") {
    add("EP-BOOLEAN", "boolean-true", true, ["type"]);
    add("EP-BOOLEAN", "boolean-false", false, ["type"]);
  }
  if (r.type === "enum") {
    for (const v of c.allowedValues)
      add("EP-ENUM", `allowed:${v}`, v, ["allowedValues"]);
    let v = "__DISALLOWED__";
    while (c.allowedValues.includes(v)) v += "_";
    add("EP-ENUM", "disallowed", v, ["allowedValues"]);
  }
  if (r.type === "email" || c.format)
    add(
      "EP-FORMAT",
      "invalid-format",
      c.format === "alphanumeric"
        ? "!".repeat(Math.max(c.minLength ?? 1, 1))
        : "invalid-email",
      ["format"],
    );
  for (const key of ["minLength", "maxLength"])
    if (c[key] !== undefined)
      for (const delta of [-1, 0, 1]) {
        const n = c[key] + delta;
        if (n >= 0)
          add(
            "BVA-LENGTH",
            `${key}:${delta}`,
            stringAt(r, n),
            [key],
            "boundary",
          );
      }
  if (["integer", "decimal"].includes(r.type)) {
    const scale = r.type === "decimal" ? 10 ** c.precision : 1,
      step = r.type === "decimal" ? Math.round(c.step * scale) : 1;
    for (const key of ["min", "max"])
      if (c[key] !== undefined)
        for (const delta of [-1, 0, 1])
          add(
            "BVA-NUMBER",
            `${key}:${delta}`,
            (Math.round(c[key] * scale) + delta * step) / scale,
            [key],
            "boundary",
          );
  }
  if (r.type === "decimal") {
    add(
      "EP-PRECISION",
      "extra-precision",
      Number(
        (representative(r) + 10 ** (-c.precision - 1)).toFixed(c.precision + 1),
      ),
      ["precision"],
    );
    if (c.step > 10 ** -c.precision)
      add(
        "EP-PRECISION",
        "off-step",
        Number((representative(r) + 10 ** -c.precision).toFixed(c.precision)),
        ["step"],
      );
  }
  for (const key of ["minDate", "maxDate"])
    if (c[key])
      for (const delta of [-1, 0, 1])
        add(
          "BVA-DATE",
          `${key}:${delta}`,
          day(c[key], delta),
          [key],
          "boundary",
        );
  return cases;
}
export function timedGeneration(requirements, sessionId, options) {
  const start = performance.now();
  const cases = requirements.flatMap((r) => generate(r, sessionId, options));
  return { cases, coreDurationMs: performance.now() - start };
}
