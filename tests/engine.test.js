import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generate, timedGeneration } from "../lib/generator.js";
import { normalizeRequirement, day } from "../lib/requirements.js";
import { assess } from "../lib/semantics.js";
import { validate, duplicates, conditions } from "../lib/validation.js";
import { metrics, experiment } from "../lib/evaluation.js";
import { csv, exportData } from "../lib/exports.js";
const dataset = JSON.parse(
  readFileSync(new URL("../benchmarks/dataset.json", import.meta.url)),
);
const fixture = (id) =>
  structuredClone(dataset.requirements.find((r) => r.id === id));
const gen = (id) =>
  generate(fixture(id), "session", { timestamp: "2026-01-01T00:00:00.000Z" });
test("password boundaries and explicit representative", () => {
  const c = gen("password");
  for (const [n, valid] of [
    [7, false],
    [8, true],
    [12, true],
    [20, true],
    [21, false],
  ])
    assert.ok(c.some((t) => t.input.length === n && t.expectedValid === valid));
});
test("same requirement, session and timestamp yields byte-identical cases", () =>
  assert.deepEqual(gen("age"), gen("age")));
test("integer boundaries are ±1 and inclusive", () => {
  const c = gen("age");
  assert.deepEqual(
    c
      .filter((t) => t.category === "boundary")
      .map((t) => [t.input, t.expectedValid]),
    [
      [17, false],
      [18, true],
      [19, true],
      [64, true],
      [65, true],
      [66, false],
    ],
  );
});
test("decimal boundaries are exact at declared step", () =>
  assert.deepEqual(
    gen("price")
      .filter((t) => t.category === "boundary")
      .map((t) => t.input),
    [0.09, 0.1, 0.11, 0.29, 0.3, 0.31],
  ));
test("decimal precision and zero-anchored step", () => {
  const r = normalizeRequirement({
    ...fixture("price"),
    constraints: { min: 0, max: 1, precision: 2, step: 0.05 },
  });
  assert.equal(assess(r, 0.15).valid, true);
  assert.equal(assess(r, 0.16).valid, false);
  assert.equal(assess(r, 0.151).valid, false);
  assert.ok(generate(r, "s").some((t) => t.objective === "off-step"));
});
test("exclusive bounds reject equality", () => {
  const r = fixture("exclusive");
  assert.equal(assess(r, 1).valid, false);
  assert.equal(assess(r, 1.1).valid, true);
  assert.equal(assess(r, 2).valid, false);
});
test("calendar operations include leap day and year transitions", () => {
  assert.equal(day("2024-02-28", 1), "2024-02-29");
  assert.equal(day("2024-02-29", 1), "2024-03-01");
  assert.equal(day("2023-12-31", 1), "2024-01-01");
  assert.ok(gen("date").some((t) => t.input === "2024-02-29"));
});
test("required and optional empty fields", () => {
  assert.equal(assess(fixture("optional"), "").valid, true);
  assert.equal(assess(fixture("password"), "").valid, false);
  assert.equal(assess(fixture("consent"), false).valid, true);
});
test("email partitions use documented ASCII format", () => {
  const r = fixture("email");
  for (const s of ["abc@example.com", "a+b@host.co"])
    assert.equal(assess(r, s).valid, true);
  for (const s of ["abc", "a..b@host.co", "x@localhost", "a b@host.co"])
    assert.equal(assess(r, s).valid, false);
});
test("unsupported and contradictory definitions are rejected", () => {
  for (const constraints of [
    { minLength: 20, maxLength: 8 },
    { pattern: ".*" },
    { maxLength: -1 },
    { format: "regex" },
  ])
    assert.throws(() =>
      normalizeRequirement({ ...fixture("password"), constraints }),
    );
  assert.throws(() =>
    normalizeRequirement({
      ...fixture("age"),
      constraints: { min: 2, max: 1 },
    }),
  );
  assert.throws(() =>
    normalizeRequirement({
      ...fixture("exclusive"),
      constraints: { min: 1, max: 1, precision: 1, minExclusive: true },
    }),
  );
  assert.throws(() =>
    normalizeRequirement({
      ...fixture("date"),
      constraints: { minDate: "2023-02-29" },
    }),
  );
});
test("every manually authored reference has independently assessed expected outcome", () => {
  for (const ref of dataset.references) {
    const r = fixture(ref.requirementId);
    assert.equal(assess(r, ref.input).valid, ref.valid, ref.id);
  }
});
test("generated benchmarks satisfy independent validation", () => {
  for (const r of dataset.requirements) {
    const report = validate([r], generate(r, "s"));
    assert.equal(report.summary.failed, 0, JSON.stringify(report));
    assert.deepEqual(report.summary.missingConditions, []);
  }
});
test("mutation: incorrect expected result fails independent checks", () => {
  const c = gen("age");
  c[0].expectedValid = false;
  assert.equal(validate([fixture("age")], c).summary.failed, 1);
});
test("mutation: claimed boundary with unrelated input fails", () => {
  const c = gen("age");
  c.find((t) => t.objective === "min:0").input = 30;
  const v = validate([fixture("age")], c);
  assert.ok(v.summary.failed);
  assert.ok(v.summary.missingConditions.includes("age/min:0"));
});
test("missing conditions and orphan requirements are reported", () => {
  const c = gen("age").slice(1);
  const v = validate([fixture("age"), fixture("password")], c);
  assert.ok(v.summary.missingConditions.includes("age/valid"));
  assert.equal(v.summary.traceabilityStatus, "Failed");
  c[0].requirementId = "orphan";
  assert.ok(validate([fixture("age")], c).summary.failed);
});
test("mutation: unknown rules, constraints and missing metadata fail", () => {
  for (const key of ["ruleId", "constraintIds", "steps"]) {
    const c = gen("age");
    c[0][key] = key === "ruleId" ? "UNKNOWN" : [];
    assert.ok(validate([fixture("age")], c).summary.failed);
  }
  for(const ruleId of ['constructor','__proto__','toString']){const c=gen('age');c[0].ruleId=ruleId;assert.ok(validate([fixture('age')],c).summary.failed);}
});
test("duplicates distinguish identical objectives from identical inputs", () => {
  const c = gen("age"),
    copy = { ...c[0], id: "copy" };
  assert.equal(duplicates([...c, copy]).length, 1);
  assert.equal(duplicates(c).length, 0);
  assert.equal(
    duplicates([...c, { ...copy, objective: "different" }]).length,
    0,
  );
});
test("coverage decreases on removed reference condition; metrics use real counts", () => {
  const r = fixture("age"),
    c = gen("age"),
    refs = dataset.references.filter((x) => x.requirementId === "age");
  const full = metrics([r], c, refs),
    partial = metrics([r], c.slice(1), refs);
  assert.equal(full.coverage, 100);
  assert.ok(partial.coverage < 100);
  assert.equal(
    metrics([r], [...c, { ...c[0], id: "copy" }], refs).duplicationRate,
    10,
  );
  const wrong = structuredClone(c);
  wrong[0].expectedValid = false;
  assert.ok(metrics([r], wrong, refs).correctness < 100);
});
test("monotonic timing excludes persistence, empty metrics are undefined", () => {
  const t = timedGeneration([fixture("age")], "s");
  assert.ok(Number.isFinite(t.coreDurationMs) && t.coreDurationMs >= 0);
  assert.equal(t.cases.length, 9);
  assert.equal(metrics([], [], []).coverage, null);
  assert.throws(() => experiment(dataset, { repetitions: 101 }));
});
test("CSV escapes multiline quotes and neutralizes spreadsheet formulas", () => {
  const s = csv([{ input: ' =HYPERLINK("x")', note: 'a,\nb"c' }]);
  assert.ok(s.includes("' =HYPERLINK"));
  assert.ok(s.includes('b""c'));
  assert.ok(s.startsWith("\uFEFF"));
});
test("JSON export includes schema, rules and validation metadata", () => {
  const cases = gen("age");
  const out = JSON.parse(
    exportData(
      "cases",
      {
        id: "s",
        cases,
        ruleVersion: "1.0.0",
        validation: validate([fixture("age")], cases),
      },
      "json",
    ),
  );
  assert.equal(out.schema, "research-framework/1.0");
  assert.equal(out.data[0].validationStatus, "Passed");
});
test("no generator import in validator; condition expectations independently enumerated", () => {
  const source = readFileSync(
    new URL("../lib/validation.js", import.meta.url),
    "utf8",
  );
  assert.ok(!source.includes("from './generator"));
  assert.equal(conditions(fixture("age")).length, 9);
});
test("small finite string and integer domains validate across optional and exclusive constraints", () => {
  for (let min = 0; min < 4; min++)
    for (let max = Math.max(1, min); max < 5; max++)
      for (const required of [true, false]) {
        const r = normalizeRequirement({
          ...fixture("password"),
          required,
          constraints: { minLength: min, maxLength: max },
        });
        assert.equal(validate([r], generate(r, "s")).summary.failed, 0);
      }
  for (let min = -3; min < 3; min++)
    for (let max = min + 2; max < 5; max++)
      for (const minExclusive of [false, true]) {
        const r = normalizeRequirement({
          ...fixture("age"),
          constraints: { min, max, minExclusive },
        });
        assert.equal(validate([r], generate(r, "s")).summary.failed, 0);
      }
});
test("optional maximum-zero strings have an empty valid partition", () => {
  const r = normalizeRequirement({
      ...fixture("optional"),
      constraints: { maxLength: 0 },
    }),
    cases = generate(r, "s");
  assert.equal(cases[0].input, "");
  assert.equal(validate([r], cases).summary.failed, 0);
});
test("duplicate identities fail even if objectives differ", () => {
  const c = gen("age");
  c[1].id = c[0].id;
  assert.equal(validate([fixture("age")], c).summary.failed, 2);
});
test('invalid metadata types fail without crashing assessment',()=>{const c=gen('age');c[0].constraintIds={bad:true};c[1].title=42;c[2].steps=[null];assert.equal(validate([fixture('age')],c).summary.failed,3);});
