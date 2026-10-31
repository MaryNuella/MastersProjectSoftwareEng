import { createClient } from "@supabase/supabase-js";
import { InputError } from "../requirements.js";
export async function authenticated(request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new InputError(
      "Supabase is not configured. Follow docs/deployment-guide.md.",
      503,
    );
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (.+)$/)?.[1];
  if (!token) throw new InputError("Sign in to continue", 401);
  const db = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user)
    throw new InputError("Session expired or invalid", 401);
  return { db, user: data.user };
}
export async function result(query) {
  const { data, error } = await query;
  if (error) {
    console.error("Database operation failed", error.code);
    throw new InputError(
      error.code === "23505"
        ? "Conflicting record"
        : error.code === "42501"
          ? "Access denied"
          : "Database operation failed; verify migrations and permissions",
      error.code === "42501" ? 403 : 400,
    );
  }
  return data;
}
export async function ownedProject(db, id) {
  const p = await result(
    db.from("projects").select("*").eq("id", id).maybeSingle(),
  );
  if (!p) throw new InputError("Project not found", 404);
  return p;
}
export async function loadSession(db, id) {
  const session = await result(
    db.from("generation_sessions").select("*").eq("id", id).maybeSingle(),
  );
  if (!session) throw new InputError("Session not found", 404);
  const cases = [];
  for (let start = 0; start < 2500; start += 500) {
    const page = await result(
      db
        .from("test_cases")
        .select("payload")
        .eq("session_id", id)
        .order("ordinal")
        .range(start, start + 499),
    );
    cases.push(...page);
    if (page.length < 500) break;
  }
  return {
    ...session,
    ...session.payload,
    id: session.id,
    cases: cases.map((c) => c.payload),
  };
}
