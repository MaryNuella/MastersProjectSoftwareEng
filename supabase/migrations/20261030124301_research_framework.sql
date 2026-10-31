-- Source schema. The CLI-generated migration is the deployable copy.
grant usage on schema public to authenticated;
create table public.projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 200), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(id,owner_id)
);
create index projects_owner on public.projects(owner_id);
create table public.rule_versions(version text primary key, catalogue jsonb not null, created_at timestamptz not null default now());
insert into public.rule_versions values('1.0.0','{"rules":["EP-VALID","EP-EMPTY","EP-TYPE","EP-FORMAT","EP-ENUM","EP-BOOLEAN","EP-PRECISION","BVA-LENGTH","BVA-NUMBER","BVA-DATE"]}',now());
create table public.requirements (
 id uuid primary key, project_id uuid not null, owner_id uuid not null default auth.uid(), definition jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete cascade, unique(id,owner_id)
);
create index requirements_project on public.requirements(project_id);
create index requirements_owner on public.requirements(owner_id);
create table public.constraints (
 id text primary key, requirement_id uuid not null, owner_id uuid not null default auth.uid(), key text not null, value jsonb not null,
 created_at timestamptz not null default now(), foreign key(requirement_id,owner_id) references public.requirements(id,owner_id) on delete cascade, unique(requirement_id,key)
);
create index constraints_owner on public.constraints(owner_id);
create table public.generation_sessions (
 id uuid primary key, project_id uuid not null, owner_id uuid not null default auth.uid(), rule_version text not null references public.rule_versions(version), payload jsonb not null,
 created_at timestamptz not null default now(),foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete cascade,unique(id,owner_id)
);
create index sessions_project on public.generation_sessions(project_id);
create index sessions_owner on public.generation_sessions(owner_id);
-- Snapshots deliberately survive deletion of a live requirement.
create table public.session_requirements (
 session_id uuid not null, requirement_id uuid not null, owner_id uuid not null default auth.uid(), definition jsonb not null,
 primary key(session_id,requirement_id),foreign key(session_id,owner_id) references public.generation_sessions(id,owner_id) on delete cascade
);
create index snapshots_owner on public.session_requirements(owner_id);
create table public.test_cases (
 id text primary key, session_id uuid not null, requirement_id uuid not null, owner_id uuid not null default auth.uid(),ordinal integer not null, payload jsonb not null,
 created_at timestamptz not null default now(),foreign key(session_id,requirement_id) references public.session_requirements(session_id,requirement_id) on delete cascade,
 foreign key(session_id,owner_id) references public.generation_sessions(id,owner_id) on delete cascade,unique(session_id,ordinal),unique(id,session_id,owner_id)
);
create index cases_owner on public.test_cases(owner_id);
create table public.validation_findings (
 id uuid primary key default gen_random_uuid(),session_id uuid not null,case_id text not null,owner_id uuid not null default auth.uid(),payload jsonb not null,created_at timestamptz not null default now(),
 foreign key(case_id,session_id,owner_id) references public.test_cases(id,session_id,owner_id) on delete cascade,unique(session_id,case_id)
);
create index findings_owner on public.validation_findings(owner_id);
create table public.traceability_mappings (
 session_id uuid not null,requirement_id uuid not null,owner_id uuid not null default auth.uid(),payload jsonb not null,
 primary key(session_id,requirement_id), foreign key(session_id,requirement_id) references public.session_requirements(session_id,requirement_id) on delete cascade,
 foreign key(session_id,owner_id) references public.generation_sessions(id,owner_id) on delete cascade
);
create index traceability_owner on public.traceability_mappings(owner_id);
create table public.evaluation_datasets (
 id uuid primary key default gen_random_uuid(),owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,version text not null,payload jsonb not null,created_at timestamptz not null default now(),unique(owner_id,version)
);
create table public.evaluation_runs (
 id uuid primary key default gen_random_uuid(),project_id uuid not null,owner_id uuid not null default auth.uid(),dataset_version text not null,payload jsonb not null,created_at timestamptz not null default now(),
 foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete cascade,
 foreign key(owner_id,dataset_version) references public.evaluation_datasets(owner_id,version)
);
create index evaluation_runs_project on public.evaluation_runs(project_id);
create index evaluation_runs_owner on public.evaluation_runs(owner_id);
do $$ declare t text; begin
 foreach t in array array['projects','requirements','constraints','generation_sessions','session_requirements','test_cases','validation_findings','traceability_mappings','evaluation_datasets','evaluation_runs'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('create policy owner_access on public.%I to authenticated using ((select auth.uid())=owner_id) with check ((select auth.uid())=owner_id)',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 end loop;
end $$;
alter table public.rule_versions enable row level security;
create policy rule_read on public.rule_versions for select to authenticated using(true);
grant select on public.rule_versions to authenticated;

create function public.save_requirement(p_definition jsonb,p_update boolean default false) returns jsonb language plpgsql security invoker set search_path='' as $$
declare rid uuid:=(p_definition->>'id')::uuid; pid uuid:=(p_definition->>'projectId')::uuid; d jsonb; k text; v jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.projects where id=pid and owner_id=auth.uid()) then raise exception 'Project not accessible';end if;
 if p_update then
 update public.requirements set definition=p_definition,updated_at=now() where id=rid and project_id=pid and owner_id=auth.uid();
 if not found then raise exception 'Requirement not accessible';end if;
 else insert into public.requirements(id,project_id,definition) values(rid,pid,p_definition);end if;
 select p_definition||jsonb_build_object('createdAt',created_at,'updatedAt',updated_at) into d from public.requirements where id=rid;
 update public.requirements set definition=d where id=rid;
 delete from public.constraints where requirement_id=rid;
 for k,v in select key,value from jsonb_each((d->'constraints')||jsonb_build_object('required',d->'required','type',d->'type')) loop
 insert into public.constraints(id,requirement_id,key,value) values(rid::text||':'||k,rid,k,v);end loop;
 return d;
end $$;
create function public.save_validation(p_session uuid,p_validation jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare f jsonb;t jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.generation_sessions where id=p_session and owner_id=auth.uid()) then raise exception 'Session not accessible';end if;
 delete from public.validation_findings where session_id=p_session;
 delete from public.traceability_mappings where session_id=p_session;
 for f in select value from jsonb_array_elements(p_validation->'findings') loop insert into public.validation_findings(session_id,case_id,payload) values(p_session,f->>'caseId',f);end loop;
 for t in select value from jsonb_array_elements(p_validation->'traceability') loop insert into public.traceability_mappings(session_id,requirement_id,payload) values(p_session,(t->>'requirementId')::uuid,t);end loop;
 update public.generation_sessions set payload=jsonb_set(payload,'{validation}',p_validation) where id=p_session;
end $$;
create function public.save_session(p_id uuid,p_project uuid,p_payload jsonb,p_cases jsonb) returns void language plpgsql security invoker set search_path='' as $$
declare r jsonb;c jsonb;i integer:=0;
begin
 if auth.uid() is null or not exists(select 1 from public.projects where id=p_project and owner_id=auth.uid()) then raise exception 'Project not accessible';end if;
 if jsonb_array_length(p_cases)>2500 or jsonb_array_length(p_payload->'requirements')>50 then raise exception 'Generation limit exceeded';end if;
 insert into public.generation_sessions(id,project_id,rule_version,payload) values(p_id,p_project,p_payload->>'ruleVersion',p_payload);
 for r in select value from jsonb_array_elements(p_payload->'requirements') loop
 if not exists(select 1 from public.requirements where id=(r->>'id')::uuid and project_id=p_project and owner_id=auth.uid()) then raise exception 'Requirement not accessible';end if;
 insert into public.session_requirements(session_id,requirement_id,definition) values(p_id,(r->>'id')::uuid,r);end loop;
 for c in select value from jsonb_array_elements(p_cases) loop i:=i+1;insert into public.test_cases(id,session_id,requirement_id,ordinal,payload) values(c->>'id',p_id,(c->>'requirementId')::uuid,i,c);end loop;
 perform public.save_validation(p_id,p_payload->'validation');
end $$;
revoke all on function public.save_requirement(jsonb,boolean) from public,anon;
revoke all on function public.save_session(uuid,uuid,jsonb,jsonb) from public,anon;
revoke all on function public.save_validation(uuid,jsonb) from public,anon;
grant execute on function public.save_requirement(jsonb,boolean),public.save_session(uuid,uuid,jsonb,jsonb),public.save_validation(uuid,jsonb) to authenticated;
