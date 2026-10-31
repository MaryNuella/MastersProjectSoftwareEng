export const TYPES = [
  "text",
  "email",
  "password",
  "integer",
  "decimal",
  "date",
  "boolean",
  "enum",
];
export class InputError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export function strictKeys(object, keys) {
  if (!object || typeof object !== "object" || Array.isArray(object))
    throw new InputError("Expected an object");
  for (const key of Object.keys(object))
    if (!keys.includes(key))
      throw new InputError(`Unsupported property: ${key}`);
}
export function text(value, name, max = 200) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new InputError(`${name} must contain 1–${max} characters`);
  return value.trim();
}
export function isDate(v) {
  if (
    typeof v !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    v < "1000-01-01" ||
    v > "9998-12-31"
  )
    return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !isNaN(d) && d.toISOString().slice(0, 10) === v;
}
export function day(v, delta) {
  const d = new Date(`${v}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
export function normalizeRequirement(raw) {
  strictKeys(raw, [
    "id",
    "projectId",
    "title",
    "description",
    "fieldName",
    "type",
    "required",
    "constraints",
    "validBehaviour",
    "invalidBehaviour",
    "createdAt",
    "updatedAt",
  ]);
  if (!TYPES.includes(raw.type)) throw new InputError("Unsupported input type");
  if (typeof raw.required !== "boolean")
    throw new InputError("required must be boolean");
  const allowed = {
    text: ["minLength", "maxLength", "format"],
    password: ["minLength", "maxLength", "format"],
    email: ["minLength", "maxLength", "format"],
    integer: ["min", "max", "minExclusive", "maxExclusive"],
    decimal: [
      "min",
      "max",
      "minExclusive",
      "maxExclusive",
      "precision",
      "step",
    ],
    date: ["minDate", "maxDate", "minExclusive", "maxExclusive"],
    boolean: [],
    enum: ["allowedValues"],
  }[raw.type];
  strictKeys(raw.constraints ?? {}, allowed);
  const c = { ...(raw.constraints ?? {}) };
  for (const key of ["minExclusive", "maxExclusive"])
    if (key in c && typeof c[key] !== "boolean")
      throw new InputError(`${key} must be boolean`);
  for (const key of ["minLength", "maxLength"])
    if (key in c && (!Number.isInteger(c[key]) || c[key] < 0 || c[key] > 1024))
      throw new InputError(`${key} must be an integer from 0 to 1024`);
  if (c.minLength > c.maxLength)
    throw new InputError("Minimum length exceeds maximum length");
  if ("format" in c && !["email", "alphanumeric"].includes(c.format))
    throw new InputError("Supported formats: email, alphanumeric");
  if (raw.type === "email" && c.format && c.format !== "email")
    throw new InputError("Email fields require email format");
  for (const key of ["min", "max"])
    if (
      key in c &&
      (!Number.isFinite(c[key]) ||
        Math.abs(c[key]) > 1e9 ||
        (raw.type === "integer" && !Number.isInteger(c[key])))
    )
      throw new InputError(
        `${key} must be finite, within ±1e9 and compatible with type`,
      );
  if (raw.type === "decimal") {
    if (!Number.isInteger(c.precision) || c.precision < 0 || c.precision > 6)
      throw new InputError("Decimal precision (0–6) is required");
    const scale = 10 ** c.precision;
    if (c.step === undefined) c.step = 1 / scale;
    if (
      !Number.isFinite(c.step) ||
      c.step <= 0 ||
      c.step > 1e6 ||
      Math.abs(c.step * scale - Math.round(c.step * scale)) > 1e-6
    )
      throw new InputError(
        "Step must be positive and representable at declared precision",
      );
    for (const key of ["min", "max"])
      if (
        key in c &&
        Math.abs(c[key] * scale - Math.round(c[key] * scale)) > 1e-6
      )
        throw new InputError("Numeric bounds exceed declared precision");
  }
  for (const key of ["minDate", "maxDate"])
    if (key in c && !isDate(c[key]))
      throw new InputError(`${key} must be a valid ISO date, years 1000–9998`);
  if (c.min > c.max || c.minDate > c.maxDate)
    throw new InputError("Minimum exceeds maximum");
  for (const [flag, bound] of [
    ["minExclusive", raw.type === "date" ? "minDate" : "min"],
    ["maxExclusive", raw.type === "date" ? "maxDate" : "max"],
  ])
    if (c[flag] && c[bound] === undefined)
      throw new InputError(`${flag} requires its bound`);
  if (
    raw.type === "enum" &&
    (!Array.isArray(c.allowedValues) ||
      !c.allowedValues.length ||
      c.allowedValues.length > 30 ||
      c.allowedValues.some(
        (v) => typeof v !== "string" || !v || v.length > 100,
      ) ||
      new Set(c.allowedValues).size !== c.allowedValues.length)
  )
    throw new InputError("Provide 1–30 unique nonempty allowed strings");
  const r = {
    ...raw,
    title: text(raw.title, "Title"),
    description: text(raw.description, "Description", 2000),
    fieldName: text(raw.fieldName, "Field name", 100),
    validBehaviour: text(raw.validBehaviour, "Valid behaviour", 1000),
    invalidBehaviour: text(raw.invalidBehaviour, "Invalid behaviour", 1000),
    constraints: c,
  };
  if (["integer", "decimal"].includes(r.type)) {
    const b = numericLimits(r);
    if (b.low > b.high)
      throw new InputError("No representable valid value between bounds");
  }
  if (
    r.type === "date" &&
    c.minDate &&
    c.maxDate &&
    day(c.minDate, c.minExclusive ? 1 : 0) >
      day(c.maxDate, c.maxExclusive ? -1 : 0)
  )
    throw new InputError("No valid calendar date between bounds");
  if (
    ["email", "text", "password"].includes(r.type) &&
    (r.type === "email" || c.format === "email") &&
    c.maxLength !== undefined &&
    c.maxLength < 6
  )
    throw new InputError("Email format requires at least six characters");
  if (r.required && c.maxLength === 0)
    throw new InputError("Required string cannot have maximum length zero");
  return r;
}
export function numericLimits(r) {
  const c = r.constraints,
    scale = r.type === "decimal" ? 10 ** c.precision : 1,
    step = r.type === "decimal" ? Math.round(c.step * scale) : 1;
  const lo = c.min === undefined ? -1e9 * scale : Math.round(c.min * scale),
    hi = c.max === undefined ? 1e9 * scale : Math.round(c.max * scale);
  return {
    scale,
    step,
    low: Math.ceil((lo + (c.minExclusive ? 1 : 0)) / step) * step,
    high: Math.floor((hi - (c.maxExclusive ? 1 : 0)) / step) * step,
  };
}
export function constraintsOf(r) {
  return [
    "type",
    "required",
    ...Object.keys(r.constraints).filter(
      (k) => !["minExclusive", "maxExclusive"].includes(k),
    ),
  ].map((k) => ({
    id: `${r.id}:${k}`,
    key: k,
    value:
      k === "type" ? r.type : k === "required" ? r.required : r.constraints[k],
  }));
}
