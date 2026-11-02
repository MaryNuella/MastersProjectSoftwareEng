import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { parseCSV, previewCSV, templateCSV, CSV_LIMIT, REQUIREMENT_COLUMNS, MANUAL_COLUMNS } from "../lib/csv-import.js";
import { validateManualCases, unvalidatedManualReport } from "../lib/manual-cases.js";
import { exportData } from "../lib/exports.js";
import { importCSV } from "../lib/server/csv-import.js";
import { authenticated } from "../lib/server/db.js";

const project = randomUUID(), rid = randomUUID();
const requirement = { id: rid, projectId: project, title: "Password policy", description: "Required password of 8-20 characters", fieldName: "password", type: "password", required: true, validBehaviour: "Accept input", invalidBehaviour: "Reject input", constraints: { minLength: 8, maxLength: 20 } };
const manual = { id: "manual:one", sessionId: "session", requirementId: rid, title: "Manual boundary", input: "12345678", expectedValid: true, expectedResult: "Accept input", category: "boundary", objective: "minLength:0", source: "manual_csv", validationStatus: "Unvalidated" };
const makeCSV = (columns, values) => [columns, values].map(row => row.map(x => '"' + String(x).replaceAll('"','""') + '"').join(",")).join("\r\n");

test("templates preview successfully with existing normalizer and unique field-name mapping", () => {
  assert.equal(previewCSV("requirements", templateCSV("requirements")).validCount, 1);
  const result = previewCSV("manual-cases", templateCSV("manual-cases"), [requirement]);
  assert.equal(result.validCount, 1); assert.equal(result.rows[0].value.requirementId, rid);
});
test("CSV parser handles BOM, reordered columns, quoted commas, embedded newlines and escapes", () => {
  assert.deepEqual(parseCSV('\uFEFFa,b\r\n"x,y","line\n""quoted"""\r\n'), [["a","b"],["x,y",'line\n"quoted"']]);
  const columns = [...REQUIREMENT_COLUMNS].reverse();
  const row = { ...requirement, constraints: JSON.stringify(requirement.constraints) };
  assert.equal(previewCSV("requirements",makeCSV(columns,columns.map(k=>row[k]))).validCount,1);
});
test("malformed CSV, unsupported/duplicate headers, raw controls and oversized files reject", () => {
  for (const csv of ['a,b\n"open,x', 'a,b\nx"y,z', 'a,b\n"x"suffix,z', "a,a\nx,y", "a,b\nx,\u0000", "x".repeat(CSV_LIMIT+1)]) assert.throws(()=>previewCSV("requirements",csv));
  const short = templateCSV("requirements").split("\r\n")[0]+"\r\nwrong,columns";
  assert.equal(previewCSV("requirements",short).invalidCount,1);
});
test("row-specific constraint errors, duplicate rows and existing requirements are shown before import", () => {
  const template = templateCSV("requirements"), line=template.split("\r\n")[1];
  assert.equal(previewCSV("requirements",template+"\r\n"+line).invalidCount,1);
  assert.equal(previewCSV("requirements",template,[requirement]).invalidCount,1);
  const values=["Bad bounds","Description","password","password","true","Accept","Reject",'{"minLength":20,"maxLength":8}'];
  const result=previewCSV("requirements",makeCSV(REQUIREMENT_COLUMNS,values));
  assert.match(result.rows[0].errors[0],/Minimum length/); assert.equal(result.rows[0].row,2);
});
test("ambiguous/foreign references require explicit owned mapping; unsafe JSON/formulas rejected", () => {
  const second={...requirement,id:randomUUID()};
  assert.equal(previewCSV("manual-cases",templateCSV("manual-cases"),[requirement,second]).invalidCount,1);
  assert.equal(previewCSV("manual-cases",templateCSV("manual-cases"),[requirement,second],[],{password:rid}).validCount,1);
  assert.equal(previewCSV("manual-cases",templateCSV("manual-cases"),[requirement],[],{password:randomUUID()}).invalidCount,1);
  for(const input of ['{"__proto__":{}}','"=HYPERLINK(x)"','1e400','[]']) {
    const csv=makeCSV(MANUAL_COLUMNS,["password","Manual",input,"true","Accept input","boundary","minLength:0"]);
    assert.equal(previewCSV("manual-cases",csv,[requirement]).invalidCount,1);
  }
  const renamed={...manual,title:"A new title"};
  assert.equal(previewCSV("manual-cases",templateCSV("manual-cases"),[requirement],[renamed]).invalidCount,1);
});
test("manual report remains unvalidated until explicit independent checks; wrong claims fail", () => {
  const pending=unvalidatedManualReport([requirement],[manual]);
  assert.equal(pending.findings[0].status,"Unvalidated");assert.equal(pending.summary.passed,0);
  const passed=validateManualCases([requirement],[manual]);
  assert.equal(passed.findings[0].status,"Passed");assert.equal(passed.scope,"manual-constraint-checks/v1");
  assert.deepEqual(passed.traceability[0].rules,[]);assert.equal(manual.ruleId,undefined);
  const wrong=validateManualCases([requirement],[{...manual,input:"x"}]);
  assert.equal(wrong.findings[0].status,"Failed");assert.equal(wrong.summary.passed,0);
});
test("manual CSV/JSON exports preserve source, absent generation metadata, and pending/assessed status", () => {
  const data={id:"session",source:"manual_csv",requirements:[requirement],cases:[manual],validation:null};
  for(const kind of ["cases","validation","traceability"]) {
    const output=JSON.parse(exportData(kind,data,"json"));assert.equal(output.metadata.source,"manual_csv");
    assert.equal(output.metadata.ruleVersion,undefined);assert.equal(output.data[0].source,"manual_csv");
    assert.match(exportData(kind,data,"csv"),/manual_csv/);
  }
  assert.equal(JSON.parse(exportData("cases",data,"json")).data[0].validationStatus,"Unvalidated");
  data.validation=validateManualCases(data.requirements,data.cases);
  assert.equal(JSON.parse(exportData("cases",data,"json")).data[0].validationStatus,"Passed");
  assert.equal(JSON.parse(exportData("cases",data,"json")).data[0].generatedAt,undefined);
});

function fakeDB({ authorized=true, rpcError=null }={}) {
  const calls=[];
  return { calls,
    from(table) {
      const builder={ select(){return this;},eq(){return this;},order(){return this;},range(){return Promise.resolve({data:[]});},maybeSingle(){return Promise.resolve({data:authorized?{id:project}:null});} };
      return builder;
    },
    async rpc(name,args) {calls.push({name,args});return {data:{imported:args.p_rows.length},error:rpcError};}
  };
}
test("server import requires owned project, valid preview and explicit unchanged confirmation", async () => {
  const db=fakeDB(), body={projectId:project,fileName:"requirements.csv",csv:templateCSV("requirements")};
  const preview=await importCSV(db,"requirements","preview",body); assert.equal(db.calls.length,0);
  await assert.rejects(()=>importCSV(db,"requirements","confirm",body),/confirmation/);
  await assert.rejects(()=>importCSV(db,"requirements","confirm",{...body,confirmed:true,previewDigest:"stale"}),/Preview/);
  const result=await importCSV(db,"requirements","confirm",{...body,confirmed:true,previewDigest:preview.digest});
  assert.equal(result.imported,1);assert.equal(db.calls.length,1);assert.equal(db.calls[0].name,"import_requirements_csv");
  await assert.rejects(()=>importCSV(fakeDB({authorized:false}),"requirements","preview",body),/Project not found/);
  const oldURL=process.env.NEXT_PUBLIC_SUPABASE_URL, oldKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:1"; process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="local-fixture";
    await assert.rejects(()=>authenticated(new Request("https://local/api/imports/requirements/preview")),/Sign in/);
  } finally {
    if(oldURL===undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL=oldURL;
    if(oldKey===undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY; else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=oldKey;
  }
});
test("invalid rows cannot partially import; missing migration and concurrent duplicates give safe errors", async () => {
  const body={projectId:project,fileName:"requirements.csv",csv:templateCSV("requirements")};
  for (const [code,pattern] of [["PGRST202",/not enabled/],["23505",/Duplicate detected/],["42501",/Access denied/]]) {
    const db=fakeDB({rpcError:{code}}), preview=await importCSV(db,"requirements","preview",body);
    await assert.rejects(()=>importCSV(db,"requirements","confirm",{...body,confirmed:true,previewDigest:preview.digest}),pattern);
  }
  const csv=body.csv+"\r\n"+body.csv.split("\r\n")[1];const db=fakeDB();
  const preview=await importCSV(db,"requirements","preview",{...body,csv});
  await assert.rejects(()=>importCSV(db,"requirements","confirm",{...body,csv,confirmed:true,previewDigest:preview.digest}),/Every row/);
  assert.equal(db.calls.length,0);
  await assert.rejects(()=>importCSV(db,"requirements","preview",{...body,fileName:"data.exe"}),/\.csv/);
});
