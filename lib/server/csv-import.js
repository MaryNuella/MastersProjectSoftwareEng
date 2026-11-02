import { createHash } from "node:crypto";
import { InputError, strictKeys } from "../requirements.js";
import { canonical, previewCSV } from "../csv-import.js";
import { ownedProject, result } from "./db.js";

export async function importCSV(db, kind, action, body) {
  strictKeys(body, ["projectId", "fileName", "csv", "mapping", "previewDigest", "confirmed"]);
  if (!["requirements", "manual-cases"].includes(kind) || !["preview", "confirm"].includes(action)) throw new InputError("Unknown import route", 404);
  if (typeof body.fileName !== "string" || body.fileName.length > 200 || !/\.csv$/i.test(body.fileName)) throw new InputError("Select a .csv file");
  if (typeof body.projectId !== "string") throw new InputError("Select an active project");
  await ownedProject(db, body.projectId);
  const mapping = body.mapping ?? {};
  if (!mapping || typeof mapping !== "object" || Array.isArray(mapping) || Object.values(mapping).some(v => typeof v !== "string")) throw new InputError("Invalid requirement mapping");
  const requiredRows = await result(db.from("requirements").select("definition").eq("project_id", body.projectId).order("id").range(0, 1000));
  if (requiredRows.length > 1000) throw new InputError("CSV import supports projects with up to 1,000 requirements");
  const requirements = requiredRows.map(r => r.definition);
  const existing = [];
  if (kind === "manual-cases") {
    for (let start = 0; ; start += 500) {
      const page = await result(db.from("test_cases").select("payload,generation_sessions!inner(project_id,payload)")
        .eq("generation_sessions.project_id", body.projectId).eq("generation_sessions.payload->>source", "manual_csv").order("id").range(start, start + 499));
      existing.push(...page.map(r => r.payload));
      if (page.length < 500) break;
      if (existing.length >= 10000) throw new InputError("Manual-case duplicate preview is limited to 10,000 existing cases; no import was saved");
    }
  }
  const preview = previewCSV(kind, body.csv, requirements, existing, mapping);
  const digest = createHash("sha256").update(canonical({ kind, projectId: body.projectId, csv: body.csv, mapping, requirements, rows: preview.rows })).digest("hex");
  if (action === "preview") return { ...preview, digest };
  if (body.confirmed !== true || !body.previewDigest || body.previewDigest !== digest) throw new InputError("Preview has changed or confirmation is missing. Preview again before importing.", 409);
  if (preview.invalidCount || !preview.validCount) throw new InputError("Every row must be valid; nothing was imported", 422);
  const rpc = kind === "requirements" ? "import_requirements_csv" : "import_manual_cases_csv";
  const { data, error } = await db.rpc(rpc, { p_project: body.projectId, p_rows: preview.rows.map(r => r.value) });
  if (error) {
    if (["PGRST202", "42883"].includes(error.code)) throw new InputError("CSV import is not enabled: the prepared database migration still requires approval and application.", 503);
    if (error.code === "23505") throw new InputError("Duplicate detected during confirmation; nothing was imported. Preview again.", 409);
    if (error.code === "42501") throw new InputError("Access denied; nothing was imported", 403);
    throw new InputError("Import rejected by database checks; nothing was imported. Preview again or review the import format.", 422);
  }
  return data;
}
