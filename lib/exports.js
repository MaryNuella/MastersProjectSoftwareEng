export const EXPORT_SCHEMA = "research-framework/1.0";
import { unvalidatedManualReport } from "./manual-cases.js";
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
  const manual = data.source === "manual_csv";
  const report = manual && data.validation?.scope !== "manual-constraint-checks/v1"
    ? unvalidatedManualReport(data.requirements, data.cases) : data.validation;
  const content =
    kind === "traceability"
      ? report.traceability
      : kind === "validation"
        ? report.findings
        : kind === "evaluation"
          ? [data]
          : data.cases.map((t) => ({
              ...t,
              validationStatus:
                report.findings.find((f) => f.caseId === t.id)
                  ?.status ?? "Not assessed",
            }));
  const rows = kind === "evaluation" ? content : content.map(r => ({ ...r, source: manual ? "manual_csv" : "generated" }));
  return format === "csv"
    ? csv(rows)
    : JSON.stringify(
        {
          schema: EXPORT_SCHEMA,
          kind,
          exportedAt: new Date().toISOString(),
          metadata: { sessionId: data.id, source: manual ? "manual_csv" : kind === "evaluation" ? "evaluation" : "generated", ...(manual ? { assessmentScope: report.scope, assessmentRuleVersion: report.assessmentRuleVersion } : { ruleVersion: data.ruleVersion }) },
          data: rows,
        },
        null,
        2,
      );
}
