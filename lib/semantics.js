import { isDate } from "./requirements.js";
export function assess(r, value) {
  const c = r.constraints,
    violations = [];
  const bad = (k) => violations.push(`${r.id}:${k}`);
  if (value === null || value === undefined || value === "") {
    if (r.required) bad("required");
    return { valid: !violations.length, violations };
  }
  const types = {
    text: "string",
    password: "string",
    email: "string",
    enum: "string",
    boolean: "boolean",
    integer: "number",
    decimal: "number",
    date: "string",
  };
  if (
    typeof value !== types[r.type] ||
    (["integer", "decimal"].includes(r.type) && !Number.isFinite(value)) ||
    (r.type === "integer" && !Number.isInteger(value)) ||
    (r.type === "date" && !isDate(value))
  ) {
    bad("type");
    return { valid: false, violations };
  }
  if (["text", "password", "email"].includes(r.type)) {
    const n = [...value].length;
    if (c.minLength !== undefined && n < c.minLength) bad("minLength");
    if (c.maxLength !== undefined && n > c.maxLength) bad("maxLength");
    if (
      (r.type === "email" || c.format === "email") &&
      !/^[A-Za-z0-9]+(?:[._+-][A-Za-z0-9]+)*@[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?:\.[A-Za-z]{2,})+$/.test(
        value,
      )
    )
      bad("format");
    if (c.format === "alphanumeric" && !/^[a-zA-Z0-9]+$/.test(value))
      bad("format");
  }
  if (["integer", "decimal"].includes(r.type)) {
    if (
      c.min !== undefined &&
      (value < c.min || (c.minExclusive && value === c.min))
    )
      bad("min");
    if (
      c.max !== undefined &&
      (value > c.max || (c.maxExclusive && value === c.max))
    )
      bad("max");
    if (r.type === "decimal") {
      const s = 10 ** c.precision;
      if (Math.abs(value * s - Math.round(value * s)) > 1e-6) bad("precision");
      if (Math.abs(value / c.step - Math.round(value / c.step)) > 1e-6)
        bad("step");
    }
  }
  if (r.type === "date") {
    if (
      c.minDate &&
      (value < c.minDate || (c.minExclusive && value === c.minDate))
    )
      bad("minDate");
    if (
      c.maxDate &&
      (value > c.maxDate || (c.maxExclusive && value === c.maxDate))
    )
      bad("maxDate");
  }
  if (r.type === "enum" && !c.allowedValues.includes(value))
    bad("allowedValues");
  return { valid: !violations.length, violations };
}
