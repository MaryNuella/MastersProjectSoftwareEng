import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {metrics,experiment} from '../lib/evaluation.js';
import {generate} from '../lib/generator.js';
import {validate} from '../lib/validation.js';
import {validateManualCases} from '../lib/manual-cases.js';
const dataset=JSON.parse(readFileSync(new URL('../benchmarks/dataset.json',import.meta.url)));
const password=dataset.requirements.find(r=>r.id==='password');
const ref=dataset.references.filter(r=>r.id==='password/minLength:0');
const generated=generate(password,'test').find(t=>t.objective==='minLength:0');
const manual={id:'manual-one',source:'manual_csv',requirementId:'password',title:'Minimum boundary',input:'abcdefgh',expectedValid:true,expectedResult:'Accept input',category:'boundary',objective:'minLength:0'};
test('equivalent boundaries receive identical semantic scores without generation metadata',()=>{
  assert.deepEqual(metrics([password],[manual],ref),metrics([password],[generated],ref));
  assert.equal(metrics([password],[manual],ref).coverage,100);
  assert.equal(validateManualCases([password],[manual]).summary.passed,1);
  assert.equal(manual.generatedAt,undefined);
});
test('incorrect input, outcome, category, objective and requirement remain failures',()=>{
  for(const change of [{input:'abc'},{expectedValid:false},{expectedResult:'Wrong'},{category:'positive'},{objective:'maxLength:0'},{requirementId:'project-uuid'}]){
    const value=metrics([password],[{...manual,...change}],ref);
    assert.equal(value.correctness,0,JSON.stringify(change));assert.equal(value.coverage,0);
  }
});
test('duplicate inputs do not inflate coverage or evade redundancy using generated metadata',()=>{
  const result=metrics([password],[generated,{...manual,id:'copy',input:generated.input}],ref);
  assert.equal(result.coveredConditions,1);assert.equal(result.redundant,1);assert.equal(result.duplicationRate,50);
  const collision=metrics([password],[manual,{...manual,input:'bad'}],ref);
  assert.equal(collision.correctness,50);
});
test('exact enum membership and numeric boundaries stay strict',()=>{
  const role=dataset.requirements.find(r=>r.id==='role');
  const value={...manual,requirementId:'role',input:'editor',objective:'allowed:reader',category:'positive'};
  assert.equal(metrics([role],[value],dataset.references.filter(r=>r.id==='role/allowed:reader')).coverage,0);
  const age=dataset.requirements.find(r=>r.id==='age');
  assert.equal(metrics([age],[{...manual,requirementId:'age',input:19,objective:'min:0'}],dataset.references.filter(r=>r.id==='age/min:0')).correctness,0);
});
test('generated certification remains mandatory and distinct from semantic comparison',()=>{
  assert.equal(validate([password],[generated]).summary.passed,1);
  assert.equal(validate([password],[manual]).summary.failed,1);
  const broken={...generated};delete broken.generatedAt;
  assert.equal(metrics([password],[broken],ref).correctness,100);
  assert.equal(validate([password],[broken]).summary.failed,1);
  const run=experiment(dataset,{repetitions:1});
  assert.equal(run.evaluationMethodVersion,'2.0.0');
  assert.equal(run.runs[0].correctness,100);
  assert.equal(run.runs[0].generatedMetadataCertification.passed,78);
});
test('assessment preserves inputs, provenance, benchmark and supplied historical records',()=>{
  const historical={runs:[{correctness:12,coverage:34}],manual:null};
  const before=structuredClone({dataset,manual,historical});
  metrics([password],[manual],ref);experiment(dataset,{repetitions:1,manual:historical});
  assert.deepEqual({dataset,manual,historical},before);
});
