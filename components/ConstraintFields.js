"use client";
export default function ConstraintFields({ type, text, onChange }) {
  let c;
  try { c = JSON.parse(text); } catch { return <p className="notice">Correct the Advanced JSON syntax to use guided controls.</p>; }
  if (!c || Array.isArray(c) || typeof c !== "object") return <p className="notice">Constraints must be a JSON object. Correct the Advanced JSON below.</p>;
  function update(key, value) {
    const next = { ...c };
    if (value === undefined) delete next[key]; else next[key] = value;
    onChange(JSON.stringify(next, null, 2));
  }
  const numeric = ["integer", "decimal"].includes(type);
  const string = ["text", "password", "email"].includes(type);
  const field = (key, label, inputType = "number", help = "Leave blank for no limit.") => <label key={key}>{label}<input aria-label={label} type={inputType} step="any" value={c[key] ?? ""} onChange={e => update(key, e.target.value === "" ? undefined : inputType === "number" ? Number(e.target.value) : e.target.value)} /><span className="helper">{help}</span></label>;
  return <fieldset><legend>Constraint settings</legend><p className="helper">These controls use the existing constraint definitions. The server validates your configuration when you save.</p><div className="form-grid">
    {string && <>{field("minLength", "Minimum length")}{field("maxLength", "Maximum length")}<label>Format<select value={c.format ?? ""} onChange={e => update("format", e.target.value || undefined)}><option value="">Type default</option><option value="email">Email</option>{type !== "email" && <option value="alphanumeric">Alphanumeric</option>}</select></label></>}
    {numeric && <>{field("min", "Minimum value")}{field("max", "Maximum value")}</>}
    {type === "decimal" && <>{field("precision", "Decimal precision", "number", "Required: 0-6 decimal places.")}{field("step", "Numeric step", "number", "Defaults to 10^-precision; anchored at zero.")}</>}
    {type === "date" && <>{field("minDate", "Earliest date", "date")}{field("maxDate", "Latest date", "date")}</>}
    {(numeric || type === "date") && [ ["minExclusive", "Exclude minimum"], ["maxExclusive", "Exclude maximum"] ].map(([key,label]) => <label className="check" key={key}><input type="checkbox" checked={c[key] === true} onChange={e=>update(key,e.target.checked)} />{label}</label>)}
    {type === "enum" && <label>Allowed values<textarea rows={5} value={Array.isArray(c.allowedValues) ? c.allowedValues.join("\n") : ""} onChange={e=>update("allowedValues",e.target.value.split("\n"))} /><span className="helper">One value per line. 1-30 unique, nonempty strings; spaces are preserved.</span></label>}
    {type === "boolean" && <p>No additional constraints. Native true and false are supported; requiredness is set above.</p>}
  </div></fieldset>;
}
