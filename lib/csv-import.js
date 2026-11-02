import { InputError, normalizeRequirement } from "./requirements.js";

export const CSV_LIMIT = 180000; // leaves space for JSON escaping inside the API's 256 KiB cap
export const REQUIREMENT_COLUMNS = ["title", "description", "fieldName", "type", "required", "validBehaviour", "invalidBehaviour", "constraints"];
export const MANUAL_COLUMNS = ["requirementRef", "title", "input", "expectedValid", "expectedResult", "category", "objective"];
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value);
}
export function requirementSignature(r) {
  const { id, projectId, createdAt, updatedAt, ...definition } = normalizeRequirement(r);
  return canonical(definition);
}
export function manualSignature(r) {
  return canonical(Object.fromEntries(["requirementId", "input", "expectedValid", "expectedResult", "category", "objective"].map(k => [k, r[k]])));
}
function safeValue(v) {
  if (typeof v === "string" && /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) throw new InputError("Control characters are not supported");
  if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) {
    if (["__proto__", "constructor", "prototype"].includes(k)) throw new InputError("Unsafe JSON property");
    safeValue(x);
  }
}
function textCell(s) {
  safeValue(s);
  if (/^[\s]*[=+@-]/.test(s)) throw new InputError("Formula-like text is not allowed; use plain text");
  return s;
}
function jsonCell(s, name) {
  let v;
  try { v = JSON.parse(s); } catch { throw new InputError(`${name} must contain valid JSON`); }
  safeValue(v);
  return v;
}
function flag(s, name) {
  if (!["true", "false"].includes(s.trim())) throw new InputError(`${name} must be true or false`);
  return s.trim() === "true";
}

// Strict quoted CSV state machine: embedded newlines and escaped double quotes supported.
export function parseCSV(text, maxRows = 2500) {
  if (typeof text !== "string" || new TextEncoder().encode(text).length > CSV_LIMIT) throw new InputError("CSV exceeds the 180,000-byte limit", 413);
  safeValue(text);
  const s = text.replace(/^\uFEFF/, "");
  const rows = []; let row = [], cell = "", quoted = false, closed = false;
  function endCell() { row.push(cell); cell = ""; closed = false; }
  function endRow() { endCell(); rows.push(row); row = []; if (rows.length > maxRows + 1) throw new InputError(`Maximum ${maxRows} data rows`); }
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
      else cell += ch;
    } else if (ch === '"') {
      if (cell || closed) throw new InputError("Malformed CSV: quote inside an unquoted field");
      quoted = true;
    } else if (ch === ",") endCell();
    else if (ch === "\n" || ch === "\r") { endRow(); if (ch === "\r" && s[i + 1] === "\n") i++; }
    else { if (closed) throw new InputError("Malformed CSV: text after closing quote"); cell += ch; }
  }
  if (quoted) throw new InputError("Malformed CSV: unclosed quoted field");
  if (cell || row.length || closed) endRow();
  if (rows.length < 2) throw new InputError("CSV must include headers and at least one data row");
  return rows;
}

export function previewCSV(kind, csv, requirements = [], existingManual = [], mapping = {}) {
  const columns = kind === "requirements" ? REQUIREMENT_COLUMNS : MANUAL_COLUMNS;
  if (!["requirements", "manual-cases"].includes(kind)) throw new InputError("Unsupported import kind");
  const [headers, ...lines] = parseCSV(csv, kind === "requirements" ? 50 : 2500);
  if (headers.length !== columns.length || new Set(headers).size !== headers.length || columns.some(k => !headers.includes(k))) throw new InputError(`Required columns (no extras): ${columns.join(", ")}`);
  const byId = new Map(requirements.map(r => [r.id, r]));
  const seen = new Set(kind === "requirements" ? requirements.map(requirementSignature) : existingManual.map(manualSignature));
  const refs = new Set();
  const rows = lines.map((cells, i) => {
    const raw = Object.fromEntries(headers.map((h, j) => [h, cells[j] ?? ""]));
    try {
      if (cells.length !== headers.length) throw new InputError(`Expected ${headers.length} columns; received ${cells.length}`);
      let value;
      if (kind === "requirements") {
        for (const k of columns.filter(k => !["constraints", "required"].includes(k))) textCell(raw[k]);
        value = normalizeRequirement({ ...raw, required: flag(raw.required, "required"), constraints: jsonCell(raw.constraints, "constraints") });
      } else {
        const ref = textCell(raw.requirementRef).trim(); refs.add(ref);
        const matches = requirements.filter(r => r.fieldName === ref);
        const id = mapping[ref] || (byId.has(ref) ? ref : matches.length === 1 ? matches[0].id : null);
        if (!id || !byId.has(id)) throw new InputError(`Map requirement reference '${ref}' to a requirement in this project`);
        for (const k of ["title", "expectedResult", "category", "objective"]) {
          textCell(raw[k]);
          const limit = k === "expectedResult" ? 1000 : 200;
          if (!raw[k].trim() || raw[k].length > limit) throw new InputError(`${k} must contain 1-${limit} characters`);
        }
        const input = jsonCell(raw.input, "input");
        if (input !== null && typeof input === "object" || typeof input === "number" && !Number.isFinite(input) || typeof input === "string" && input.length > 2048) throw new InputError("input must be a finite JSON scalar; strings up to 2048 characters");
        if (typeof input === "string") textCell(input);
        if (!["positive", "negative", "boundary"].includes(raw.category.trim())) throw new InputError("category must be positive, negative or boundary");
        value = { requirementId: id, title: raw.title.trim(), input, expectedValid: flag(raw.expectedValid, "expectedValid"), expectedResult: raw.expectedResult.trim(), category: raw.category.trim(), objective: raw.objective.trim() };
      }
      const signature = kind === "requirements" ? requirementSignature(value) : manualSignature(value);
      if (seen.has(signature)) throw new InputError("Duplicate row in this file or existing project records");
      seen.add(signature);
      return { row: i + 2, valid: true, value, errors: [] };
    } catch (e) { return { row: i + 2, valid: false, raw, errors: [e.message] }; }
  });
  if (kind === "manual-cases" && new Set(rows.filter(r => r.valid).map(r => r.value.requirementId)).size > 50) throw new InputError("At most 50 requirements per manual import");
  return { rows, references: [...refs], validCount: rows.filter(r => r.valid).length, invalidCount: rows.filter(r => !r.valid).length };
}

export function templateCSV(kind) {
  const headers = kind === "requirements" ? REQUIREMENT_COLUMNS : MANUAL_COLUMNS;
  const values = kind === "requirements"
    ? ["Password policy", "Required password of 8-20 characters", "password", "password", "true", "Accept input", "Reject input", '{"minLength":8,"maxLength":20}']
    : ["password", "Minimum password boundary", '"12345678"', "true", "Accept input", "boundary", "minLength:0"];
  const quote = v => '"' + v.replaceAll('"', '""') + '"';
  return "\uFEFF" + [headers, values].map(row => row.map(quote).join(",")).join("\r\n");
}
