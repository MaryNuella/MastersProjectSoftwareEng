import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { csvLocalDatabase } from "./helpers/csv-local-database.js";
import { normalizeRequirement } from "../lib/requirements.js";
import { generate } from "../lib/generator.js";
import { validate } from "../lib/validation.js";
import { importCSV } from "../lib/server/csv-import.js";
import { templateCSV } from "../lib/csv-import.js";
import { loadSession } from "../lib/server/db.js";
import { validateManualCases } from "../lib/manual-cases.js";
import { exportData } from "../lib/exports.js";
import { csvSupabaseAdapter } from "./helpers/csv-supabase-adapter.js";

const migration = new URL("../supabase/migrations/20261102123737_atomic_csv_imports.sql", import.meta.url);
const tables = ["projects", "requirements", "constraints", "generation_sessions", "session_requirements", "test_cases", "validation_findings", "traceability_mappings"];
const a = randomUUID(), b = randomUUID(), project = randomUUID(), otherProject = randomUUID();
const requirement = (title = "Imported password") => ({ title, description: "Disposable local fixture", fieldName: "password", type: "password", required: true, validBehaviour: "Accept", invalidBehaviour: "Reject", constraints: { minLength: 8, maxLength: 20 } });

test("local PostgreSQL CSV import functions (no remote credentials or network)", async t => {
  const db = await csvLocalDatabase();
  t.after(() => db.close());
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;
    grant execute on function auth.uid() to anon,authenticated;
  `);
  await db.exec(await readFile(new URL("../supabase/migrations/20261030124301_research_framework.sql", import.meta.url), "utf8"));
  const structure = async () => (await db.query(`select c.relname, c.relrowsecurity,
    (select jsonb_agg(jsonb_build_object('name',a.attname,'type',a.atttypid::regtype::text,'not_null',a.attnotnull) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) as columns,
    (select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename=c.relname) as policies
    from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r' order by c.relname`)).rows;
  const structureBefore = await structure();
  const sql = await readFile(migration, "utf8");
  await db.exec(sql);
  assert.deepEqual(await structure(), structureBefore, "Migration must not change tables, columns or RLS policies");
  await db.query("insert into auth.users values ($1),($2)", [a,b]);
  await db.query("insert into public.projects(id,owner_id,title) values ($1,$2,'Local test A'),($3,$4,'Local test B')", [project,a,otherProject,b]);
  await db.exec("set role authenticated");
  async function login(uid = a) { await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]); }
  await login();
  async function rpc(name, rows, pid = project) {
    return (await db.query(`select public.${name}($1::uuid,$2::jsonb) as result`, [pid,JSON.stringify(rows)])).rows[0].result;
  }
  async function state() {
    const out = {};
    for (const name of tables) out[name] = (await db.query(`select coalesce(jsonb_agg(r order by r::text),'[]'::jsonb) as data from (select to_jsonb(x) as r from public.${name} x) q`)).rows[0].data;
    return out;
  }
  async function unchangedOnError(run, message) {
    const before = await state();
    await assert.rejects(run, message);
    assert.deepEqual(await state(), before, "Failed call must roll back all writes");
  }
  let rid, manualId;
  // Preserve a real generated session, not only a synthetic row.
  const original = normalizeRequirement({ ...requirement("Existing generated requirement"), id: randomUUID(), projectId: project });
  await db.query("select public.save_requirement($1::jsonb)", [JSON.stringify(original)]);
  const sid = randomUUID();
  const generated = generate(original,sid);
  const payload = { ruleVersion: "1.0.0", requirements: [original], coreDurationMs: 1, validation: validate([original],generated) };
  await db.query("select public.save_session($1,$2,$3::jsonb,$4::jsonb)", [sid,project,JSON.stringify(payload),JSON.stringify(generated)]);
  const generatedBefore = (await db.query("select payload from public.generation_sessions where id=$1", [sid])).rows[0].payload;
  const generatedCasesBefore = (await db.query("select payload from public.test_cases where session_id=$1 order by ordinal", [sid])).rows;
  const manual = (extra={}) => ({ requirementId:rid, title:"Manual boundary", input:"12345678", expectedValid:true, expectedResult:"Accept", category:"boundary", objective:"minLength:0", ...extra });

  await t.test("successful requirement import and normalized constraints", async () => {
    const result = await rpc("import_requirements_csv", [requirement()]);
    assert.equal(result.imported,1); rid=result.requirements[0].id;
    assert.equal(result.requirements[0].projectId,project);
    assert.equal((await db.query("select count(*)::int as n from public.constraints where requirement_id=$1", [rid])).rows[0].n,4);
  });
  await t.test("requirement batch rolls back earlier successful rows on invalid constraints", async () => {
    await unchangedOnError(()=>rpc("import_requirements_csv",[requirement("Must roll back"), {...requirement("Bad bounds"),constraints:{minLength:20,maxLength:8}}]), /Minimum length/);
  });
  await t.test("requirement duplicates in batch and later retries reject atomically", async () => {
    await unchangedOnError(()=>rpc("import_requirements_csv",[requirement("Same row"),requirement("Same row")]), /Duplicate requirement/);
    await unchangedOnError(()=>rpc("import_requirements_csv",[requirement()]), /Duplicate requirement/);
  });
  await t.test("invalid structure, unsupported constraints, impossible dates and numeric ranges reject", async () => {
    for(const rows of [null, [], {}, [null], [{...requirement(),owner_id:b}], [{...requirement(),required:"true"}], [{...requirement(),constraints:{regex:".*"}}], [{...requirement(),type:"date",constraints:{minDate:"2026-02-30"}}], [{...requirement(),type:"decimal",constraints:{precision:2,step:0.01,min:1,max:1,minExclusive:true}}], [{...requirement(),type:"enum",constraints:{allowedValues:["x","x"]}}]]) {
      await unchangedOnError(()=>rpc("import_requirements_csv",rows));
    }
  });
  await t.test("valid supported definitions agree with existing JS normalization", async () => {
    const fixtures = [
      {...requirement("Text fixture"),type:"text",constraints:{format:"alphanumeric",maxLength:12}},
      {...requirement("Email fixture"),type:"email",constraints:{maxLength:40}},
      {...requirement("Integer fixture"),type:"integer",constraints:{min:1,max:8,minExclusive:true}},
      {...requirement("Decimal fixture"),type:"decimal",constraints:{precision:2,min:0.01,max:1}},
      {...requirement("Date fixture"),type:"date",constraints:{minDate:"2024-02-28",maxDate:"2024-03-01",minExclusive:true}},
      {...requirement("Enum fixture"),type:"enum",constraints:{allowedValues:["a","b"]}},
      {...requirement("Boolean fixture"),type:"boolean",constraints:{}}
    ];
    const result=await rpc("import_requirements_csv",fixtures);
    for(let i=0;i<fixtures.length;i++) assert.deepEqual(result.requirements[i].constraints,normalizeRequirement(fixtures[i]).constraints);
  });
  await t.test("manual import has explicit provenance, snapshots and unvalidated findings only", async () => {
    const result=await rpc("import_manual_cases_csv",[manual()]);manualId=result.id;
    assert.equal(result.source,"manual_csv");assert.equal(result.validationStatus,"Unvalidated");
    const row=(await db.query("select payload from public.generation_sessions where id=$1",[manualId])).rows[0].payload;
    assert.equal(row.validation,null);assert.equal(row.source,"manual_csv");assert.equal(row.coreDurationMs,undefined);
    const c=result.cases[0];assert.equal(c.source,"manual_csv");assert.equal(c.generatedAt,undefined);assert.equal(c.ruleId,undefined);assert.equal(c.ruleVersion,undefined);
    assert.equal((await db.query("select payload->>'status' as status from public.validation_findings where session_id=$1",[manualId])).rows[0].status,"Unvalidated");
    const trace=(await db.query("select payload from public.traceability_mappings where session_id=$1",[manualId])).rows[0].payload;
    assert.equal(trace.status,"Unvalidated");assert.deepEqual(trace.covered,[]);assert.equal(trace.caseIds.length,1);assert.deepEqual(trace.rules,[]);
  });
  await t.test("manual expected outcome remains an unvalidated claim even when wrong", async () => {
    const result=await rpc("import_manual_cases_csv",[manual({title:"Wrong manual claim",input:"x",expectedValid:true})]);
    assert.equal(result.cases[0].expectedValid,true);assert.equal(result.cases[0].validationStatus,"Unvalidated");
    assert.equal(result.cases[0].source,"manual_csv");
  });
  await t.test("manual case duplicates ignore title and reject whole batch/retry", async () => {
    await unchangedOnError(()=>rpc("import_manual_cases_csv",[manual({input:"123456789",title:"One"}),manual({input:"123456789",title:"Two"})]), /Duplicate manual case/);
    await unchangedOnError(()=>rpc("import_manual_cases_csv",[manual({title:"Renamed same objective"})]), /Duplicate manual case/);
  });
  await t.test("bad later manual record rolls back session, snapshots, cases, findings and mappings", async () => {
    await unchangedOnError(()=>rpc("import_manual_cases_csv",[manual({input:"1234567890"}),manual({requirementId:randomUUID()})]), /Requirement not accessible/);
    for(const row of [manual({source:"generated"}),manual({input:{unsafe:"object"}}),manual({expectedValid:"true"}),manual({category:"generated"}),manual({objective:""})]) await unchangedOnError(()=>rpc("import_manual_cases_csv",[row]));
  });
  await t.test("same owner cannot reference a requirement from a different project", async () => {
    const secondProject=randomUUID();
    await db.query("insert into public.projects(id,title) values($1,'Other owned project')",[secondProject]);
    await unchangedOnError(()=>rpc("import_manual_cases_csv",[manual()],secondProject), /Requirement not accessible/);
  });
  await t.test("manual sessions roll back when more than 50 distinct requirements are referenced", async () => {
    const definitions=Array.from({length:51},(_,i)=>requirement(`Limit fixture ${i}`));
    const first=await rpc("import_requirements_csv",definitions.slice(0,50));
    const last=await rpc("import_requirements_csv",definitions.slice(50));
    const rows=[...first.requirements,...last.requirements].map(r=>manual({requirementId:r.id}));
    await unchangedOnError(()=>rpc("import_manual_cases_csv",rows), /At most 50 requirements/);
  });
  await t.test("authenticated cross-owner project and requirement access denied", async () => {
    await unchangedOnError(()=>rpc("import_requirements_csv",[requirement("Forbidden")],otherProject), /Project not accessible/);
    await login(b);
    await assert.rejects(()=>rpc("import_manual_cases_csv",[manual()],project), /Project not accessible/);
    await assert.rejects(()=>rpc("import_manual_cases_csv",[manual()],otherProject), /Requirement not accessible/);
    assert.equal((await db.query("select count(*)::int n from public.test_cases where session_id=$1",[manualId])).rows[0].n,0);
    await login();
  });
  await t.test("missing identity and anonymous RPC execution denied", async () => {
    await login("");await unchangedOnError(()=>rpc("import_requirements_csv",[requirement()]), /Authentication required/);
    await db.exec("reset role; set role anon");
    for(const name of ["import_requirements_csv","import_manual_cases_csv"]) await assert.rejects(()=>rpc(name,[]), /permission denied/);
    await db.exec("reset role; set role authenticated");await login();
  });
  await t.test("row/byte limits and generated provenance injection reject", async () => {
    await unchangedOnError(()=>rpc("import_requirements_csv",Array.from({length:51},()=>requirement())), /1-50/);
    await unchangedOnError(()=>rpc("import_manual_cases_csv",Array.from({length:2501},()=>manual())), /1-2500/);
    await unchangedOnError(()=>rpc("import_manual_cases_csv",[manual({input:"x".repeat(263000)})]), /256 KiB/);
    await unchangedOnError(()=>rpc("import_manual_cases_csv",[manual({generatedAt:new Date().toISOString(),ruleId:"EP-VALID"})]), /Unsupported case property/);
  });
  await t.test("existing generated session and case records remain byte-for-byte equivalent", async () => {
    assert.deepEqual((await db.query("select payload from public.generation_sessions where id=$1",[sid])).rows[0].payload,generatedBefore);
    assert.deepEqual((await db.query("select payload from public.test_cases where session_id=$1 order by ordinal",[sid])).rows,generatedCasesBefore);
    const f=(await db.query("select proname,prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') as anon_exec from pg_proc where proname in ('import_requirements_csv','import_manual_cases_csv')")).rows;
    assert.equal(f.length,2);for(const x of f){assert.equal(x.prosecdef,false);assert.equal(x.anon_exec,false);assert.ok(x.proconfig.includes('search_path=""'));}
  });
  await t.test("CSV service preview/confirm, reload, independent manual assessment and exports persist locally", async () => {
    const adapter=csvSupabaseAdapter(db);
    const body={projectId:project,fileName:"requirements.csv",csv:templateCSV("requirements").replace("Password policy","API-import policy")};
    const preview=await importCSV(adapter,"requirements","preview",body);
    assert.equal(preview.invalidCount,0);
    const saved=await importCSV(adapter,"requirements","confirm",{...body,confirmed:true,previewDigest:preview.digest});
    const id=saved.requirements[0].id;
    const manualBody={projectId:project,fileName:"manual.csv",csv:templateCSV("manual-cases"),mapping:{password:id}};
    const manualPreview=await importCSV(adapter,"manual-cases","preview",manualBody);
    assert.equal(manualPreview.invalidCount,0);
    const imported=await importCSV(adapter,"manual-cases","confirm",{...manualBody,confirmed:true,previewDigest:manualPreview.digest});
    let loaded=await loadSession(adapter,imported.id);
    assert.equal(loaded.validation.findings[0].status,"Unvalidated");
    assert.equal(JSON.parse(exportData("cases",loaded,"json")).data[0].source,"manual_csv");
    const report=validateManualCases(loaded.requirements,loaded.cases);
    assert.equal(report.findings[0].status,"Passed");
    const savedReport=await adapter.rpc("save_validation",{p_session:loaded.id,p_validation:report});
    assert.equal(savedReport.error,null);
    loaded=await loadSession(adapter,loaded.id);
    assert.equal(loaded.validation.scope,"manual-constraint-checks/v1");
    assert.equal(loaded.cases[0].validationStatus,"Passed");
    for(const kind of ["cases","validation","traceability"]) {
      assert.match(exportData(kind,loaded,"csv"),/manual_csv/);
      assert.equal(JSON.parse(exportData(kind,loaded,"json")).metadata.source,"manual_csv");
    }
    const duplicate=await importCSV(adapter,"manual-cases","preview",manualBody);
    assert.equal(duplicate.invalidCount,1);
    await login(b);
    await assert.rejects(()=>importCSV(adapter,"requirements","preview",body),/Project not found/);
    await login();
    assert.deepEqual((await db.query("select payload from public.generation_sessions where id=$1",[sid])).rows[0].payload,generatedBefore);
  });
  await t.test("PostgreSQL 17 concurrent imports block then reject duplicates without partial writes", { skip: !db.newConnection }, async () => {
    for (const [name, rows] of [
      ["import_requirements_csv", [requirement("Concurrent requirement")]],
      ["import_manual_cases_csv", [manual({ input: "concurrent input", expectedValid: false, expectedResult: "Reject" })]]
    ]) {
      const first = await db.newConnection(), second = await db.newConnection(), observer = await db.newConnection();
      try {
        for (const client of [first, second]) {
          await client.query("begin; set local role authenticated");
          await client.query("select set_config('request.jwt.claim.sub',$1,true)", [a]);
        }
        const invoke = client => client.query(`select public.${name}($1::uuid,$2::jsonb)`, [project, JSON.stringify(rows)]);
        await invoke(first);
        const pid = (await second.query("select pg_backend_pid() pid")).rows[0].pid;
        const pending = invoke(second).then(() => ({ ok: true }), error => ({ error }));
        let blocked = false;
        for (let attempt = 0; attempt < 100; attempt++) {
          const locks = (await observer.query("select cardinality(pg_blocking_pids($1)) as blockers", [pid])).rows[0].blockers;
          if (locks > 0) { blocked = true; break; }
          await new Promise(done => setTimeout(done, 20));
        }
        assert.equal(blocked, true, "Second connection must wait for project lock");
        await first.query("commit");
        const outcome = await pending;
        assert.equal(outcome.error?.code, "23505");
        await second.query("rollback");
        if (name === "import_requirements_csv") assert.equal((await db.query("select count(*)::int n from public.requirements where definition->>'title'='Concurrent requirement'")).rows[0].n, 1);
        else assert.equal((await db.query("select count(*)::int n from public.test_cases where payload->>'input'='concurrent input'")).rows[0].n, 1);
      } finally {
        await first.query("rollback"); await second.query("rollback");
        await Promise.all([first.end(), second.end(), observer.end()]);
      }
    }
  });
});
