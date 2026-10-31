import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { generate } from "../../lib/generator.js";
import { validate } from "../../lib/validation.js";
import { normalizeRequirement } from "../../lib/requirements.js";
import { loadSession } from "../../lib/server/db.js";
import { exportData } from "../../lib/exports.js";
const env = process.env;
const ready =
  env.TEST_ALLOW_DATABASE_WRITES === "true" &&
  env.TEST_SUPABASE_URL &&
  env.TEST_SUPABASE_PUBLISHABLE_KEY &&
  env.TEST_USER_EMAIL &&
  env.TEST_USER_PASSWORD &&
  env.TEST_OTHER_EMAIL &&
  env.TEST_OTHER_PASSWORD;
test(
  "Supabase persistence, transaction rollback, traceability, exports and two-user isolation",
  {
    skip: ready
      ? false
      : "Requires explicit disposable test database opt-in and two test accounts; see docs/testing-strategy.md",
  },
  async () => {
    const a = createClient(
        env.TEST_SUPABASE_URL,
        env.TEST_SUPABASE_PUBLISHABLE_KEY,
        { auth: { persistSession: false } },
      ),
      b = createClient(
        env.TEST_SUPABASE_URL,
        env.TEST_SUPABASE_PUBLISHABLE_KEY,
        { auth: { persistSession: false } },
      );
    async function ok(p) {
      const { data, error } = await p;
      assert.equal(error, null, error?.message);
      return data;
    }
    await ok(
      a.auth.signInWithPassword({
        email: env.TEST_USER_EMAIL,
        password: env.TEST_USER_PASSWORD,
      }),
    );
    await ok(
      b.auth.signInWithPassword({
        email: env.TEST_OTHER_EMAIL,
        password: env.TEST_OTHER_PASSWORD,
      }),
    );
    const project = await ok(
      a
        .from("projects")
        .insert({ title: `TEST-${randomUUID()}` })
        .select()
        .single(),
    );
    try {
      const r = normalizeRequirement({
        id: randomUUID(),
        projectId: project.id,
        title: "Password",
        description: "Persistence fixture",
        fieldName: "password",
        type: "password",
        required: true,
        constraints: { minLength: 8, maxLength: 20 },
        validBehaviour: "Accept",
        invalidBehaviour: "Reject",
      });
      const saved = await ok(a.rpc("save_requirement", { p_definition: r }));
      assert.ok(saved.createdAt);
      assert.deepEqual(
        (
          await ok(
            a.from("requirements").select("definition").eq("id", r.id).single(),
          )
        ).definition,
        saved,
      );
      assert.equal(
        (await ok(a.from("constraints").select("*").eq("requirement_id", r.id)))
          .length,
        4,
      );
      const sid = randomUUID(),
        cases = generate(saved, sid),
        validation = validate([saved], cases),
        payload = {
          ruleVersion: "1.0.0",
          requirements: [saved],
          coreDurationMs: 0,
          validation,
        };
      await ok(
        a.rpc("save_session", {
          p_id: sid,
          p_project: project.id,
          p_payload: payload,
          p_cases: cases,
        }),
      );
      const session = await loadSession(a, sid);
      assert.equal(session.cases.length, cases.length);
      assert.equal(
        (
          await ok(
            a.from("validation_findings").select("*").eq("session_id", sid),
          )
        ).length,
        cases.length,
      );
      assert.equal(
        (
          await ok(
            a.from("traceability_mappings").select("*").eq("session_id", sid),
          )
        )[0].payload.status,
        "Passed",
      );
      assert.equal(
        JSON.parse(exportData("cases", session, "json")).data.length,
        cases.length,
      );
      assert.ok(exportData("traceability", session, "csv").includes(r.id));
      await ok(
        a.rpc("save_validation", { p_session: sid, p_validation: validation }),
      );
      assert.deepEqual(
        await ok(b.from("projects").select("*").eq("id", project.id)),
        [],
      );
      assert.deepEqual(
        await ok(b.from("requirements").select("*").eq("id", r.id)),
        [],
      );
      assert.deepEqual(
        await ok(b.from("test_cases").select("*").eq("session_id", sid)),
        [],
      );
      const denied = await b.rpc("save_validation", {
        p_session: sid,
        p_validation: validation,
      });
      assert.ok(denied.error);
      const failId = randomUUID(),
        badCases = [{ ...cases[0], requirementId: randomUUID() }];
      const fail = await a.rpc("save_session", {
        p_id: failId,
        p_project: project.id,
        p_payload: payload,
        p_cases: badCases,
      });
      assert.ok(fail.error);
      assert.deepEqual(
        await ok(a.from("generation_sessions").select("*").eq("id", failId)),
        [],
      );
      await ok(a.from("requirements").delete().eq("id", r.id));
      assert.equal(
        (await loadSession(a, sid)).cases.length,
        cases.length,
        "Snapshot survives requirement deletion",
      );
    } finally {
      await ok(a.from("projects").delete().eq("id", project.id));
      await a.auth.signOut();
      await b.auth.signOut();
    }
  },
);
