// Test-only adapter: executes service queries/RPCs against the isolated SQL engine.
// It is not an application database client and has no network endpoint.
export function csvSupabaseAdapter(db) {
  return {
    from(table) {
      if (!["projects", "requirements", "test_cases", "generation_sessions"].includes(table)) throw Error("Unexpected test table");
      const filters = [], values = []; let range = null, order = null;
      async function run(single = false) {
        try {
          const join = filters.some(f => f.startsWith("s."));
          let query = `select t.* from public.${table} t${join ? " join public.generation_sessions s on s.id=t.session_id" : ""}`;
          if (filters.length) query += " where " + filters.join(" and ");
          if (order) query += " order by t." + order;
          if (range) query += ` limit ${range[1]-range[0]+1} offset ${range[0]}`;
          const rows = (await db.query(query, values)).rows;
          return { data: single ? rows[0] ?? null : rows, error: null };
        } catch (error) { return { data: null, error }; }
      }
      const builder = {
        select() { return this; },
        eq(key, value) {
          const column = { id: "t.id", project_id: "t.project_id", session_id: "t.session_id", "generation_sessions.project_id": "s.project_id", "generation_sessions.payload->>source": "s.payload->>'source'" }[key];
          if (!column) throw Error("Unexpected test filter");
          values.push(value); filters.push(`${column}=$${values.length}`); return this;
        },
        order(key) { if (!["id", "ordinal"].includes(key)) throw Error("Unexpected sort"); order = key; return this; },
        range(start,end) { range=[start,end]; return this; },
        maybeSingle() { return run(true); },
        then(resolve,reject) { return run().then(resolve,reject); }
      };
      return builder;
    },
    async rpc(name, args) {
      try {
        if (name === "save_validation") {
          await db.query("select public.save_validation($1::uuid,$2::jsonb)", [args.p_session,JSON.stringify(args.p_validation)]);
          return {data:null,error:null};
        }
        if (!["import_requirements_csv", "import_manual_cases_csv"].includes(name)) throw Error("Unexpected test RPC");
        const result=await db.query(`select public.${name}($1::uuid,$2::jsonb) as result`,[args.p_project,JSON.stringify(args.p_rows)]);
        return {data:result.rows[0].result,error:null};
      } catch (error) { return {data:null,error}; }
    }
  };
}
