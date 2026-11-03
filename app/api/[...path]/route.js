import { randomUUID } from "node:crypto";
import {
  authenticated,
  result,
  ownedProject,
  loadSession,
} from "../../../lib/server/db.js";
import {
  InputError,
  normalizeRequirement,
  text,
  strictKeys,
} from "../../../lib/requirements.js";
import { timedGeneration } from "../../../lib/generator.js";
import { validate } from "../../../lib/validation.js";
import { RULE_VERSION } from "../../../lib/rules.js";
import { exportData } from "../../../lib/exports.js";
import { experiment, metrics } from "../../../lib/evaluation.js";
import dataset from "../../../benchmarks/dataset.json";
import { importCSV } from "../../../lib/server/csv-import.js";
import { validateManualCases } from "../../../lib/manual-cases.js";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function body(req) {
  const reader = req.body?.getReader();
  if (!reader) throw new InputError("JSON body required");
  let size = 0,
    chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 262144) {
      await reader.cancel();
      throw new InputError("Request exceeds 256 KiB", 413);
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new InputError("Invalid JSON");
  }
}
async function handle(req, context) {
  try {
    const { path } = await context.params,
      [resource, id, action] = path;
    if (path.length > 3) throw new InputError("Not found", 404);
    const { db, user } = await authenticated(req),
      method = req.method;
    if (resource === "imports" && method === "POST") {
      const imported = await importCSV(db, id, action, await body(req));
      return Response.json(imported, { status: action === "confirm" ? 201 : 200 });
    }
    if (resource === "projects" && !id) {
      if (method === "GET")
        return Response.json(
          await result(
            db
              .from("projects")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(100),
          ),
        );
      if (method === "POST") {
        const b = await body(req);
        strictKeys(b, ["title"]);
        return Response.json(
          await result(
            db
              .from("projects")
              .insert({
                title: text(b.title, "Project title"),
                owner_id: user.id,
              })
              .select()
              .single(),
          ),
          { status: 201 },
        );
      }
    }
    if (resource === "requirements" && !id && method === "GET") {
      const projectId = new URL(req.url).searchParams.get("projectId");
      await ownedProject(db, projectId);
      return Response.json(
        (
          await result(
            db
              .from("requirements")
              .select("definition")
              .eq("project_id", projectId)
              .order("created_at")
              .limit(1000),
          )
        ).map((r) => r.definition),
      );
    }
    if (resource === "requirements" && ["POST", "PUT"].includes(method)) {
      const b = await body(req);
      if (method === "PUT" && !id)
        throw new InputError("Requirement ID required");
      const r = normalizeRequirement({
        ...b,
        id: method === "POST" ? randomUUID() : id,
      });
      await ownedProject(db, r.projectId);
      const saved = await result(
        db.rpc("save_requirement", {
          p_definition: r,
          p_update: method === "PUT",
        }),
      );
      return Response.json(saved, { status: method === "POST" ? 201 : 200 });
    }
    if (resource === "requirements" && id && method === "DELETE") {
      const rows = await result(
        db.from("requirements").delete().eq("id", id).select("id"),
      );
      if (!rows.length) throw new InputError("Requirement not found", 404);
      return Response.json({ deleted: true });
    }
    if (resource === "sessions" && !id && method === "GET") {
      const p = new URL(req.url).searchParams.get("projectId");
      await ownedProject(db, p);
      return Response.json(
        await result(
          db
            .from("generation_sessions")
            .select("id,created_at,payload")
            .eq("project_id", p)
            .order("created_at", { ascending: false })
            .limit(100),
        ),
      );
    }
    if (resource === "sessions" && !id && method === "POST") {
      const b = await body(req);
      strictKeys(b, ["projectId", "requirementIds"]);
      await ownedProject(db, b.projectId);
      if (
        !Array.isArray(b.requirementIds) ||
        !b.requirementIds.length ||
        b.requirementIds.length > 50 ||
        new Set(b.requirementIds).size !== b.requirementIds.length
      )
        throw new InputError("Select 1–50 unique requirements");
      const rows = await result(
        db
          .from("requirements")
          .select("definition")
          .eq("project_id", b.projectId)
          .in("id", b.requirementIds),
      );
      if (rows.length !== b.requirementIds.length)
        throw new InputError(
          "One or more requirements do not exist in this project",
          404,
        );
      const requirements = rows
          .map((r) => r.definition)
          .sort((a, b) => a.id.localeCompare(b.id)),
        sessionId = randomUUID(),
        generated = timedGeneration(requirements, sessionId);
      if (generated.cases.length > 2500)
        throw new InputError("Generation exceeds 2500 cases");
      const payload = {
        ruleVersion: RULE_VERSION,
        requirements,
        coreDurationMs: generated.coreDurationMs,
        validation: validate(requirements, generated.cases),
      };
      await result(
        db.rpc("save_session", {
          p_id: sessionId,
          p_project: b.projectId,
          p_payload: payload,
          p_cases: generated.cases,
        }),
      );
      return Response.json(
        { id: sessionId, ...payload, cases: generated.cases },
        { status: 201 },
      );
    }
    if (resource === "sessions" && id) {
      const s = await loadSession(db, id);
      if (method === "GET" && !action) return Response.json(s);
      if (method === "POST" && action === "validate") {
        const validation = s.source === "manual_csv"
          ? validateManualCases(s.requirements, s.cases)
          : validate(s.requirements, s.cases);
        await result(
          db.rpc("save_validation", {
            p_session: id,
            p_validation: validation,
          }),
        );
        return Response.json({ ...s, validation });
      }
      if (method === "GET" && action === "export") {
        const q = new URL(req.url).searchParams,
          format = q.get("format") ?? "json",
          kind = q.get("kind") ?? "cases";
        if (
          !["json", "csv"].includes(format) ||
          !["cases", "validation", "traceability"].includes(kind)
        )
          throw new InputError("Unsupported export");
        return new Response(exportData(kind, s, format), {
          headers: {
            "Content-Type":
              format === "csv" ? "text/csv; charset=utf-8" : "application/json",
            "Content-Disposition": `attachment; filename="${kind}-${id}.${format}"`,
            "Cache-Control": "no-store",
          },
        });
      }
    }
    if (resource === "evaluations" && !id) {
      if (method === "GET")
        return Response.json(
          await result(
            db
              .from("evaluation_runs")
              .select("*")
              .order("created_at", { ascending: false })
              .limit(100),
          ),
        );
      if (method === "POST") {
        const b = await body(req);
        strictKeys(b, ["projectId", "repetitions", "environment", "manual"]);
        await ownedProject(db, b.projectId);
        if (
          !Number.isInteger(b.repetitions) ||
          b.repetitions < 1 ||
          b.repetitions > 100
        )
          throw new InputError("Repetitions must be 1–100");
        let manual = null;
        if (b.manual) {
          strictKeys(b.manual, ["durationMs", "cases", "notes"]);
          if (
            !Number.isFinite(b.manual.durationMs) ||
            b.manual.durationMs <= 0 ||
            b.manual.durationMs > 86400000
          )
            throw new InputError("Actual manual duration must be >0 and ≤24h");
          if (
            !Array.isArray(b.manual.cases) ||
            b.manual.cases.length > 2500 ||
            b.manual.cases.some(
              (t) => !t || typeof t !== "object" || Array.isArray(t),
            )
          )
            throw new InputError("Manual cases must be an array ≤2500");
          manual = {
            ...b.manual,
            provenanceCertification: "Not assessed; submitted cases do not establish human authorship",
            notes: text(b.manual.notes, "Manual protocol notes", 2000),
            metrics: metrics(
              dataset.requirements,
              b.manual.cases,
              dataset.references,
            ),
          };
        }
        const report = experiment(dataset, {
          repetitions: b.repetitions,
          environment: text(b.environment, "Environment", 1000),
          manual,
        });
        await result(
          db
            .from("evaluation_datasets")
            .upsert(
              { version: dataset.version, payload: dataset },
              { onConflict: "owner_id,version" },
            ),
        );
        return Response.json(
          await result(
            db
              .from("evaluation_runs")
              .insert({
                project_id: b.projectId,
                dataset_version: dataset.version,
                payload: report,
              })
              .select()
              .single(),
          ),
          { status: 201 },
        );
      }
    }
    if (resource === "evaluations" && id && method === "GET") {
      const row = await result(
        db.from("evaluation_runs").select("*").eq("id", id).maybeSingle(),
      );
      if (!row) throw new InputError("Evaluation not found", 404);
      const f = new URL(req.url).searchParams.get("format") ?? "json";
      if (!["json", "csv"].includes(f))
        throw new InputError("Unsupported export");
      return new Response(exportData("evaluation", row.payload, f), {
        headers: {
          "Content-Type": f === "csv" ? "text/csv" : "application/json",
          "Content-Disposition": `attachment; filename="evaluation-${id}.${f}"`,
        },
      });
    }
    throw new InputError("Endpoint or method not found", 404);
  } catch (error) {
    if (!(error instanceof InputError)) console.error(error);
    return Response.json(
      {
        error:
          error instanceof InputError
            ? error.message
            : "Unexpected server error",
      },
      { status: error.status ?? 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
