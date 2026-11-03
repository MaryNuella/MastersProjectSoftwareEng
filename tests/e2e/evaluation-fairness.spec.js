import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {experiment,metrics} from '../../lib/evaluation.js';

test('Evaluation distinguishes historical scores, semantic comparison and generated certification (isolated transport)',async({page,context})=>{
  const dataset=JSON.parse(await readFile('benchmarks/dataset.json','utf8'));
  const historical={id:'historical',created_at:'2026-01-01T00:00:00Z',payload:{environment:'Historical fixture',sampleSize:10,repetitions:1,manual:null,runs:[{iteration:1,coverage:100,correctness:100,duplicationRate:0,coreDurationMs:2}]}};
  const original=JSON.stringify(historical),records=[historical];
  const owner='11111111-1111-4111-8111-111111111111',project='22222222-2222-4222-8222-222222222222',exp=Math.floor(Date.now()/1000)+3600;
  const token=`${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:owner,exp})).toString('base64url')}.isolated`;
  await context.route(/https:\/\/[^/]*supabase\.co\//,route=>route.abort());
  await page.addInitScript(({owner,project,exp,token})=>{
    localStorage.setItem('research-project',project);
    localStorage.setItem('sb-gnfktaxebbdklmjlrdgy-auth-token',JSON.stringify({access_token:token,refresh_token:'isolated',expires_at:exp,expires_in:3600,token_type:'bearer',user:{id:owner,email:'fixture@example.invalid',aud:'authenticated',role:'authenticated'}}));
  },{owner,project,exp,token});
  await page.route('**/api/**',async route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    let data=[];
    if(path==='/api/projects')data=[{id:project,title:'Local evaluation fixture'}];
    if(path==='/api/evaluations'){
      if(req.method()==='POST'){
        const body=req.postDataJSON();
        expect(body.manual.cases[0].source).toBe('manual_csv');
        expect(body.manual.cases[0].generatedAt).toBeUndefined();
        const manual={...body.manual,metrics:metrics(dataset.requirements,body.manual.cases,dataset.references)};
        data={id:'new',created_at:new Date().toISOString(),payload:experiment(dataset,{...body,manual})};
        records.unshift(data);
      }else data=records;
    }
    await route.fulfill({status:200,json:data});
  });
  await page.goto('/evaluation');
  await expect(page.getByRole('columnheader',{name:'Correctness (historical method)',exact:true})).toBeVisible();
  await page.getByLabel('Environment and protocol',{exact:true}).fill('Isolated browser verification; synthetic fixture, not research evidence');
  await page.getByLabel('Repetitions',{exact:true}).fill('1');
  await page.getByText('Optional manual comparison',{exact:true}).click();
  await page.getByRole('button',{name:'Start manual timer',exact:true}).click();
  await page.getByRole('button',{name:'Stop manual timer',exact:true}).click();
  await page.getByRole('textbox',{name:'Actual manual cases (JSON array)',exact:true}).fill(JSON.stringify([{source:'manual_csv',requirementId:'password',input:'abcdefgh',expectedValid:true,expectedResult:'Accept input',category:'boundary',objective:'minLength:0'}]));
  await page.getByLabel('Participant and controlled protocol notes',{exact:true}).fill('Synthetic browser fixture; no participant or authorship claim');
  await page.getByRole('button',{name:'Run evaluation',exact:true}).click();
  await expect(page.getByText('Evaluation recorded.',{exact:true})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Semantic correctness',exact:true})).toBeVisible();
  await expect(page.getByRole('columnheader',{name:'Generated certification (passed/assessed)',exact:true})).toBeVisible();
  await expect(page.getByText('78/78',{exact:true})).toBeVisible();
  await expect(page.getByText(/Recorded manual design time:.*correctness 100.00%/)).toBeVisible();
  expect(records[0].payload.evaluationMethodVersion).toBe('2.0.0');
  expect(records[0].payload.runs[0].coverage).toBe(100);
  expect(JSON.stringify(historical)).toBe(original);
  await expect(page.getByRole('columnheader',{name:'Correctness (historical method)',exact:true})).toBeVisible();
});
