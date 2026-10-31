export const EXPORT_SCHEMA = "research-framework/1.0";
export function csv(rows) {
  if (!rows.length) return "";
  const keys = [...new Set(rows.flatMap(Object.keys))];
  const cell = (v) => {
    let s =
      v === undefined || v === null
        ? ""
        : typeof v === "object"
          ? JSON.stringify(v)
          : String(v);
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      keys.map(cell).join(","),
      ...rows.map((row) => keys.map((k) => cell(row[k])).join(",")),
    ].join("\r\n")
  );
}
export function exportData(kind, data, format) {
  const rows =
    kind === "traceability"
      ? data.validation.traceability
      : kind === "validation"
        ? data.validation.findings
        : kind === "evaluation"
          ? [data]
          : data.cases.map((t) => ({
              ...t,
              validationStatus:
                data.validation.findings.find((f) => f.caseId === t.id)
                  ?.status ?? "Not assessed",
            }));
  return format === "csv"
    ? csv(rows)
    : JSON.stringify(
        {
          schema: EXPORT_SCHEMA,
          kind,
          exportedAt: new Date().toISOString(),
          metadata: { sessionId: data.id, ruleVersion: data.ruleVersion },
          data: rows,
        },
        null,
        2,
      );
}
