import { test, expect } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { templateCSV } from "../../lib/csv-import.js";
import { importCSV } from "../../lib/server/csv-import.js";
import { csvSupabaseAdapter } from "../helpers/csv-supabase-adapter.js";
import { loadSession } from "../../lib/server/db.js";
import { validateManualCases } from "../../lib/manual-cases.js";
import { exportData } from "../../lib/exports.js";

test("CSV preview, mapping, explicit confirmation and manual provenance workflow (isolated SQL fixture)", async ({ page, context, request }) => {
  test.setTimeout(90000);
  const db = new PGlite(), owner = randomUUID(), project = randomUUID();
  try {
    const denied = await request.post('/api/imports/requirements/preview', { data: { projectId: project } });
    expect(denied.status()).toBe(401);
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
    await db.exec(await readFile("supabase/migrations/20261030124301_research_framework.sql","utf8"));
    await db.exec(await readFile("supabase/migrations/20261102123737_atomic_csv_imports.sql","utf8"));
    await db.query("insert into auth.users values($1)",[owner]);
    await db.query("insert into public.projects(id,owner_id,title) values($1,$2,'Local CSV fixture')",[project,owner]);
    await db.exec("set role authenticated");await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
    await db.query("select public.save_requirement($1::jsonb)",[JSON.stringify({id:randomUUID(),projectId:project,title:"Previously saved",description:"Do not overwrite",fieldName:"password",type:"password",required:true,validBehaviour:"Accept input",invalidBehaviour:"Reject input",constraints:{minLength:8,maxLength:20}})]);
    const adapter = csvSupabaseAdapter(db);
    await context.route(/https:\/\/[^/]*supabase\.co\//, route => route.abort());
    const exp = Math.floor(Date.now()/1000)+86400;
    const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:owner,exp})).toString('base64url')}.local-fixture`;
    await page.addInitScript(({owner,token,exp}) => {
      localStorage.setItem('sb-gnfktaxebbdklmjlrdgy-auth-token',JSON.stringify({access_token:token,refresh_token:'local-fixture',token_type:'bearer',expires_at:exp,expires_in:86400,user:{id:owner,aud:'authenticated',role:'authenticated',email:'local-fixture@example.invalid'}}));
    },{owner,token,exp});
    // Transport is mocked; service and transactional SQL are real and isolated.
    await page.route('**/api/**', async route => {
      const request=route.request(), url=new URL(request.url()), path=url.pathname.slice(5).split('/');
      try {
        let data;
        if(path[0]==='imports') data=await importCSV(adapter,path[1],path[2],request.postDataJSON());
        else if(path[0]==='projects') data=(await db.query('select * from public.projects')).rows;
        else if(path[0]==='requirements') data=(await db.query('select definition from public.requirements where project_id=$1',[project])).rows.map(r=>r.definition);
        else if(path[0]==='sessions' && !path[1]) data=(await db.query('select id,created_at,payload from public.generation_sessions where project_id=$1 order by created_at desc',[project])).rows;
        else if(path[0]==='sessions') {
          let loaded=await loadSession(adapter,path[1]);
          if(path[2]==='validate') {
            const report=validateManualCases(loaded.requirements,loaded.cases);
            const saved=await adapter.rpc('save_validation',{p_session:loaded.id,p_validation:report});
            if(saved.error) throw saved.error;
            loaded=await loadSession(adapter,loaded.id);
          }
          if(path[2]==='export') { await route.fulfill({status:200,body:exportData(url.searchParams.get('kind'),loaded,url.searchParams.get('format')),contentType:'application/json'});return; }
          data=loaded;
        } else if(path[0]==='evaluations') data=[];
        else throw Error('Unexpected fixture endpoint');
        await route.fulfill({status:200,json:data});
      } catch(error) { await route.fulfill({status:error.status??400,json:{error:error.message}}); }
    });
    await page.goto('/requirements');
    await page.getByLabel('Active project',{exact:true}).selectOption(project);
    await page.getByRole('button',{name:'Import CSV',exact:true}).click();
    const templateDownload=page.waitForEvent('download');
    await page.getByRole('button',{name:'Download CSV template'}).click();
    expect((await templateDownload).suggestedFilename()).toBe('requirements-template.csv');
    await page.getByLabel('CSV file',{exact:true}).setInputFiles({name:'requirements.csv',mimeType:'text/csv',buffer:Buffer.from(templateCSV('requirements'))});
    await page.getByRole('button',{name:'Preview CSV'}).click();
    await expect(page.getByText('1 valid rows; 0 invalid rows. No records have been saved.')).toBeVisible();
    await expect(page.getByRole('button',{name:'Confirm import'})).toBeDisabled();
    expect((await db.query('select count(*)::int n from public.requirements')).rows[0].n).toBe(1);
    await page.getByRole('checkbox',{name:/I reviewed these rows/}).check();
    await page.getByRole('button',{name:'Confirm import'}).click();
    await expect(page.getByText('Imported 1 requirements.',{exact:true})).toBeVisible();
    expect((await db.query('select count(*)::int n from public.requirements')).rows[0].n).toBe(2);
    const imported=(await db.query("select id from public.requirements where definition->>'title'='Password policy'")).rows[0].id;
    await page.getByLabel('CSV file',{exact:true}).setInputFiles({name:'requirements.csv',mimeType:'text/csv',buffer:Buffer.from(templateCSV('requirements'))});
    await page.getByRole('button',{name:'Preview CSV'}).click();
    await expect(page.getByText('0 valid rows; 1 invalid rows. No records have been saved.')).toBeVisible();
    await expect(page.getByRole('button',{name:'Confirm import'})).toBeDisabled();
    await page.goto('/test-cases');
    await page.getByRole('button',{name:'Import CSV',exact:true}).click();
    await page.getByLabel('CSV file',{exact:true}).setInputFiles({name:'manual.csv',mimeType:'text/csv',buffer:Buffer.from(templateCSV('manual-cases'))});
    await page.getByRole('button',{name:'Preview CSV'}).click();
    await expect(page.getByText('0 valid rows; 1 invalid rows. No records have been saved.')).toBeVisible();
    await page.getByLabel('Map password',{exact:true}).selectOption(imported);
    await page.getByRole('button',{name:'Preview CSV'}).click();
    await expect(page.getByText('1 valid rows; 0 invalid rows. No records have been saved.')).toBeVisible();
    await page.getByRole('checkbox',{name:/I reviewed these rows/}).check();
    await page.getByRole('button',{name:'Confirm import'}).click();
    await expect(page.getByText('Imported 1 manual cases (Unvalidated).',{exact:true})).toBeVisible();
    await expect(page.getByText('Unvalidated',{exact:true})).toBeVisible();
    await page.goto('/traceability');
    await expect(page.getByText('manual_csv - manually authored import',{exact:true})).toBeVisible();
    // The coverage cell also contains a disclosure; exact full DOM text includes it.
    const pendingTrace = page.getByRole('row').filter({ hasText: imported });
    await expect(pendingTrace.getByRole('cell',{name:/Coverage not assessed/})).toBeVisible();
    await expect(pendingTrace.getByText('Unvalidated',{exact:true})).toBeVisible();
    await page.goto('/validation');
    await expect(page.getByRole('button',{name:'Validate manual cases'})).toBeVisible();
    await expect(page.getByText(/Missing conditions: Not assessed/)).toBeVisible();
    await page.getByRole('button',{name:'Validate manual cases'}).click();
    await expect(page.getByText('Manual constraint checks saved. No generation provenance asserted.',{exact:true})).toBeVisible();
    await page.goto('/traceability');
    await expect(page.getByText('manual_csv - manually authored import',{exact:true})).toBeVisible();
    const downloaded=page.waitForEvent('download');
    await page.getByRole('button',{name:'cases · JSON',exact:true}).click();
    const file=await downloaded;
    const exported=JSON.parse(await readFile(await file.path(),'utf8'));
    expect(exported.metadata.source).toBe('manual_csv');
    expect(exported.data[0].validationStatus).toBe('Passed');
    expect(exported.data[0].generatedAt).toBeUndefined();
    await page.goto('/history');
    await page.getByRole('button',{name:'Reopen session'}).click();
    await expect(page.getByText('manual_csv - manually authored import',{exact:true})).toBeVisible();
    expect((await db.query("select count(*)::int n from public.requirements where definition->>'title'='Previously saved'")).rows[0].n).toBe(1);
  } finally { await db.close(); }
});
