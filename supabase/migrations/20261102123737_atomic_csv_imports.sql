-- Local proposal only. Do not apply without separate approval.
-- The caller supplies parsed JSON rows, never raw CSV. The future API must run
-- normalizeRequirement and CSV/file validation before invoking these RPCs.
-- These defensive checks also protect direct authenticated RPC calls.
-- Only two new SECURITY INVOKER functions and their EXECUTE grants are created.

create function public.import_requirements_csv(p_project uuid, p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb; c jsonb; k text; typ text; allowed text[];
  saved jsonb; result_rows jsonb := '[]'::jsonb;
  scale_n numeric; step_n numeric; lo numeric; hi numeric;
  minimum_date date; maximum_date date;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  -- Serializes imports into this project. RLS still applies to every statement.
  perform 1 from public.projects
    where id = p_project and owner_id = auth.uid() for update;
  if not found then
    raise exception using errcode = '42501', message = 'Project not accessible';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'Rows must be an array';
  end if;
  if jsonb_array_length(p_rows) not between 1 and 50
     or octet_length(p_rows::text) > 262144 then
    raise exception 'Import requires 1-50 rows within 256 KiB';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) is distinct from 'object' then
      raise exception 'Each requirement must be an object';
    end if;
    if exists (select 1 from jsonb_object_keys(r) as keys(key)
      where key <> all(array['title','description','fieldName','type','required',
                             'validBehaviour','invalidBehaviour','constraints'])) then
      raise exception 'Unsupported requirement property (IDs and ownership are server assigned)';
    end if;
    foreach k in array array['title','description','fieldName','validBehaviour','invalidBehaviour'] loop
      if jsonb_typeof(r->k) is distinct from 'string'
         or length(btrim(r->>k)) = 0
         or length(r->>k) > (case k when 'description' then 2000
           when 'fieldName' then 100 when 'title' then 200 else 1000 end) then
        raise exception 'Invalid requirement text: %', k;
      end if;
      r := jsonb_set(r, array[k], to_jsonb(btrim(r->>k)));
    end loop;
    typ := r->>'type';
    if typ is null or typ <> all(array['text','password','email','integer','decimal','date','enum','boolean'])
       or jsonb_typeof(r->'required') is distinct from 'boolean'
       or jsonb_typeof(r->'constraints') is distinct from 'object' then
      raise exception 'Invalid type, required flag or constraints object';
    end if;
    c := r->'constraints';
    allowed := case typ
      when 'text' then array['minLength','maxLength','format']
      when 'password' then array['minLength','maxLength','format']
      when 'email' then array['minLength','maxLength','format']
      when 'integer' then array['min','max','minExclusive','maxExclusive']
      when 'decimal' then array['min','max','minExclusive','maxExclusive','precision','step']
      when 'date' then array['minDate','maxDate','minExclusive','maxExclusive']
      when 'enum' then array['allowedValues'] else array[]::text[] end;
    if exists(select 1 from jsonb_object_keys(c) as keys(key) where key <> all(allowed)) then
      raise exception 'Unsupported constraint for type %', typ;
    end if;
    foreach k in array array['minExclusive','maxExclusive'] loop
      if c ? k and jsonb_typeof(c->k) is distinct from 'boolean' then
        raise exception 'Exclusive flags must be boolean';
      end if;
    end loop;
    foreach k in array array['minLength','maxLength'] loop
      if c ? k then
        if jsonb_typeof(c->k) is distinct from 'number' then raise exception 'Length must be numeric'; end if;
        if (c->>k)::numeric <> trunc((c->>k)::numeric) or (c->>k)::numeric not between 0 and 1024 then
          raise exception 'Length must be an integer from 0 to 1024';
        end if;
      end if;
    end loop;
    if (c->>'minLength')::numeric > (c->>'maxLength')::numeric then
      raise exception 'Minimum length exceeds maximum length';
    end if;
    if c ? 'format' and (jsonb_typeof(c->'format') is distinct from 'string'
       or (c->>'format') <> all(array['email','alphanumeric'])) then
      raise exception 'Unsupported format';
    end if;
    if typ = 'email' and c ? 'format' and c->>'format' <> 'email' then
      raise exception 'Email fields require email format';
    end if;
    if (typ = 'email' or c->>'format' = 'email') and (c->>'maxLength')::numeric < 6 then
      raise exception 'Email format requires at least six characters';
    end if;
    if (r->>'required')::boolean and (c->>'maxLength')::numeric = 0 then
      raise exception 'Required string cannot have maximum length zero';
    end if;
    foreach k in array array['min','max'] loop
      if c ? k then
        if jsonb_typeof(c->k) is distinct from 'number' then raise exception 'Bounds must be numeric'; end if;
        if abs((c->>k)::numeric) > 1e9
           or (typ = 'integer' and (c->>k)::numeric <> trunc((c->>k)::numeric)) then
          raise exception 'Numeric bound out of range or incompatible with type';
        end if;
      end if;
    end loop;
    scale_n := 1; step_n := 1;
    if typ = 'decimal' then
      if jsonb_typeof(c->'precision') is distinct from 'number' then
        raise exception 'Decimal precision is required';
      end if;
      if (c->>'precision')::numeric not between 0 and 6
         or (c->>'precision')::numeric <> trunc((c->>'precision')::numeric) then
        raise exception 'Decimal precision must be an integer from 0 to 6';
      end if;
      scale_n := power(10::numeric, (c->>'precision')::integer);
      if not (c ? 'step') then c := c || jsonb_build_object('step', 1 / scale_n); end if;
      if jsonb_typeof(c->'step') is distinct from 'number' then raise exception 'Step must be numeric'; end if;
      step_n := (c->>'step')::numeric * scale_n;
      if step_n <= 0 or (c->>'step')::numeric > 1e6 or abs(step_n - round(step_n)) > 1e-6 then
        raise exception 'Step is incompatible with precision';
      end if;
      step_n := round(step_n);
      if step_n = 0 then raise exception 'Step is below representable precision'; end if;
      foreach k in array array['min','max'] loop
        if c ? k and abs((c->>k)::numeric * scale_n - round((c->>k)::numeric * scale_n)) > 1e-6 then
          raise exception 'Bounds exceed precision';
        end if;
      end loop;
    end if;
    if typ in ('integer','decimal') then
      if (c->>'minExclusive')::boolean and not (c ? 'min')
         or (c->>'maxExclusive')::boolean and not (c ? 'max') then
        raise exception 'Exclusive flag requires its bound';
      end if;
      lo := coalesce((c->>'min')::numeric, -1e9) * scale_n;
      hi := coalesce((c->>'max')::numeric, 1e9) * scale_n;
      if lo > hi then raise exception 'Minimum exceeds maximum'; end if;
      lo := ceil((round(lo) + case when (c->>'minExclusive')::boolean then 1 else 0 end) / step_n) * step_n;
      hi := floor((round(hi) - case when (c->>'maxExclusive')::boolean then 1 else 0 end) / step_n) * step_n;
      if lo > hi then raise exception 'No representable valid value between bounds'; end if;
    end if;
    if typ = 'date' then
      foreach k in array array['minDate','maxDate'] loop
        if c ? k then
          if jsonb_typeof(c->k) is distinct from 'string' or (c->>k) !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
             or c->>k < '1000-01-01' or c->>k > '9998-12-31' then raise exception 'Invalid ISO date'; end if;
          -- date cast rejects impossible calendar dates without rolling them over.
          perform (c->>k)::date;
        end if;
      end loop;
      if (c->>'minExclusive')::boolean and not (c ? 'minDate')
         or (c->>'maxExclusive')::boolean and not (c ? 'maxDate') then
        raise exception 'Exclusive flag requires its date bound';
      end if;
      minimum_date := (c->>'minDate')::date + case when (c->>'minExclusive')::boolean then 1 else 0 end;
      maximum_date := (c->>'maxDate')::date - case when (c->>'maxExclusive')::boolean then 1 else 0 end;
      if minimum_date > maximum_date then raise exception 'No valid date between bounds'; end if;
    end if;
    if typ = 'enum' then
      if jsonb_typeof(c->'allowedValues') is distinct from 'array' then raise exception 'Allowed values must be an array'; end if;
      if jsonb_array_length(c->'allowedValues') not between 1 and 30 then raise exception 'Provide 1-30 enum values'; end if;
      if exists(select 1 from jsonb_array_elements(c->'allowedValues') as vals(value)
         where jsonb_typeof(value) <> 'string' or length(value #>> '{}') not between 1 and 100)
         or (select count(*) <> count(distinct value) from jsonb_array_elements(c->'allowedValues') as vals(value)) then
        raise exception 'Enum values must be unique nonempty strings';
      end if;
    end if;
    r := jsonb_set(r, '{constraints}', c);
    if exists(select 1 from public.requirements q where q.project_id = p_project and q.owner_id = auth.uid()
      and q.definition - array['id','projectId','createdAt','updatedAt'] = r) then
      raise exception using errcode = '23505', message = 'Duplicate requirement in project or import batch';
    end if;
    -- No updates: new IDs only. Any later exception rolls back every earlier save.
    saved := public.save_requirement(r || jsonb_build_object('id', gen_random_uuid(), 'projectId', p_project), false);
    result_rows := result_rows || jsonb_build_array(saved);
  end loop;
  return jsonb_build_object('imported', jsonb_array_length(result_rows), 'requirements', result_rows);
end $$;

create function public.import_manual_cases_csv(p_project uuid, p_rows jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  r jsonb; k text; rid uuid; sid uuid := gen_random_uuid(); cid text;
  ordinal_n integer := 0; imported_at timestamptz := now();
  snapshot jsonb; snapshots jsonb := '[]'::jsonb; cases_json jsonb := '[]'::jsonb;
  seen jsonb := '[]'::jsonb; signature jsonb; case_payload jsonb;
begin
  if auth.uid() is null then raise exception using errcode='42501', message='Authentication required'; end if;
  perform 1 from public.projects where id=p_project and owner_id=auth.uid() for update;
  if not found then raise exception using errcode='42501', message='Project not accessible'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Rows must be an array'; end if;
  if jsonb_array_length(p_rows) not between 1 and 2500 or octet_length(p_rows::text) > 262144 then
    raise exception 'Import requires 1-2500 cases within 256 KiB';
  end if;

  -- This is a rule catalogue compatibility reference, NOT a generation claim.
  insert into public.generation_sessions(id,project_id,rule_version,payload)
    values(sid,p_project,'1.0.0',jsonb_build_object('source','manual_csv',
      'importedAt',imported_at,'validationStatus','Unvalidated',
      'assessmentRuleVersion','1.0.0','requirements','[]'::jsonb,'validation',null));

  for r in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(r) is distinct from 'object' then raise exception 'Each case must be an object'; end if;
    if exists(select 1 from jsonb_object_keys(r) as keys(key) where key <> all(array[
      'requirementId','title','input','expectedValid','expectedResult','category','objective'])) then
      raise exception 'Unsupported case property: provenance and IDs are server assigned';
    end if;
    foreach k in array array['requirementId','title','expectedResult','category','objective'] loop
      if jsonb_typeof(r->k) is distinct from 'string' or length(btrim(r->>k)) = 0
         or length(r->>k) > (case k when 'expectedResult' then 1000 when 'requirementId' then 36 else 200 end) then
        raise exception 'Invalid manual case text: %', k;
      end if;
      r := jsonb_set(r,array[k],to_jsonb(btrim(r->>k)));
    end loop;
    if not (r ? 'input') or jsonb_typeof(r->'input') not in ('string','number','boolean','null')
       or jsonb_typeof(r->'expectedValid') is distinct from 'boolean'
       or r->>'category' <> all(array['positive','negative','boundary']) then
      raise exception 'Invalid input, expected validity or category';
    end if;
    if jsonb_typeof(r->'input') = 'number' then
      -- Reject JSON numerics that cannot be represented by the JavaScript clients.
      perform (r->>'input')::double precision;
    end if;
    if jsonb_typeof(r->'input') = 'string' and length(r->>'input') > 2048 then
      raise exception 'Manual input exceeds 2048 characters';
    end if;
    rid := (r->>'requirementId')::uuid;
    -- Keep snapshots consistent while importing, and prevent cross-project links.
    select definition into snapshot from public.requirements
      where id=rid and project_id=p_project and owner_id=auth.uid() for share;
    if not found then raise exception using errcode='42501', message='Requirement not accessible in this project'; end if;
    r := jsonb_set(r,'{requirementId}',to_jsonb(rid::text));
    signature := r - 'title';
    if seen @> jsonb_build_array(signature) or exists(
      select 1 from public.test_cases t join public.generation_sessions s on s.id=t.session_id
      where s.project_id=p_project and s.owner_id=auth.uid() and s.payload->>'source'='manual_csv'
        and t.payload - array['id','sessionId','title','source','importedAt','validationStatus'] = signature
    ) then raise exception using errcode='23505', message='Duplicate manual case in project or import batch'; end if;
    seen := seen || jsonb_build_array(signature);
    if not exists(select 1 from public.session_requirements where session_id=sid and requirement_id=rid) then
      if jsonb_array_length(snapshots) >= 50 then raise exception 'At most 50 requirements per manual session'; end if;
      insert into public.session_requirements(session_id,requirement_id,definition) values(sid,rid,snapshot);
      snapshots := snapshots || jsonb_build_array(snapshot);
      insert into public.traceability_mappings(session_id,requirement_id,payload) values(sid,rid,
        jsonb_build_object('source','manual_csv','requirementId',rid,'description',snapshot->>'description',
          'constraints',snapshot->'constraints','caseIds','[]'::jsonb,'rules','[]'::jsonb,
          'covered','[]'::jsonb,'uncovered',jsonb_build_array('Not assessed: manually imported cases'),
          'status','Unvalidated'));
    end if;
    ordinal_n := ordinal_n + 1;
    cid := 'manual:' || sid::text || ':' || ordinal_n::text;
    case_payload := r || jsonb_build_object('id',cid,'sessionId',sid,'source','manual_csv',
      'importedAt',imported_at,'validationStatus','Unvalidated');
    insert into public.test_cases(id,session_id,requirement_id,ordinal,payload) values(cid,sid,rid,ordinal_n,case_payload);
    insert into public.validation_findings(session_id,case_id,payload) values(sid,cid,
      jsonb_build_object('source','manual_csv','caseId',cid,'status','Unvalidated',
        'messages',jsonb_build_array('Imported manual claim; no independent validation performed')));
    update public.traceability_mappings set payload=jsonb_set(payload,'{caseIds}',
      (payload->'caseIds') || jsonb_build_array(cid)) where session_id=sid and requirement_id=rid;
    cases_json := cases_json || jsonb_build_array(case_payload);
  end loop;
  update public.generation_sessions set payload=payload || jsonb_build_object('requirements',snapshots)
    where id=sid;
  return jsonb_build_object('id',sid,'source','manual_csv','validationStatus','Unvalidated',
    'imported',ordinal_n,'requirements',snapshots,'cases',cases_json);
end $$;

revoke all on function public.import_requirements_csv(uuid,jsonb) from public, anon;
revoke all on function public.import_manual_cases_csv(uuid,jsonb) from public, anon;
grant execute on function public.import_requirements_csv(uuid,jsonb) to authenticated;
grant execute on function public.import_manual_cases_csv(uuid,jsonb) to authenticated;
