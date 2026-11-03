"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { browserDb } from "../lib/browser";
import { TYPES } from "../lib/requirements";
import { RULE_VERSION } from "../lib/rules";
import CSVImport from "./CSVImport";
import ConstraintFields from "./ConstraintFields";
import Documentation from "./Documentation";
import dataset from "../benchmarks/dataset.json";
const navigation = [
  ["dashboard", "Overview"],
  ["projects", "Projects"],
  ["requirements", "Requirements"],
  ["generation", "Generate cases"],
  ["test-cases", "Test repository"],
  ["validation", "Validation"],
  ["traceability", "Traceability"],
  ["evaluation", "Evaluation"],
  ["history", "History"],
  ["documentation", "Documentation"],
];
const empty = {
  title: "",
  description: "",
  fieldName: "",
  type: "password",
  required: true,
  constraints: { minLength: 8, maxLength: 20 },
  validBehaviour: "Accept input",
  invalidBehaviour: "Reject input",
};
function Table({ headers, rows }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((r, i) => (
              <tr key={i}>
                {r.map((v, j) => (
                  <td key={j}>{v}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={headers.length}>No saved records yet. Create a project, add requirements, then generate a session to build your evidence.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function Badge({ children }) {
  return (
    <span
      className={`badge ${children === "Passed" ? "success" : children === "Failed" ? "failure" : ""}`}
    >
      {children}
    </span>
  );
}
export default function Workspace({ section }) {
  const [auth, setAuth] = useState(null),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [projects, setProjects] = useState([]),
    [projectId, setProjectId] = useState(""),
    [requirements, setRequirements] = useState([]),
    [selected, setSelected] = useState([]),
    [history, setHistory] = useState([]),
    [session, setSession] = useState(null),
    [evaluations, setEvaluations] = useState([]),
    [draft, setDraft] = useState(empty),
    [constraintText, setConstraintText] = useState(
      JSON.stringify(empty.constraints, null, 2),
    ),
    [projectTitle, setProjectTitle] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [environment, setEnvironment] = useState(""),
    [repetitions, setRepetitions] = useState(10),
    [manualText, setManualText] = useState("[]"),
    [manualNotes, setManualNotes] = useState(""),
    [duration, setDuration] = useState(null),
    [timing, setTiming] = useState(false),
    [query, setQuery] = useState("");
  const timer = useRef(null);
  const db = browserDb();
  useEffect(() => {
    if (!db) return;
    db.auth.getSession().then(({ data }) => setAuth(data.session));
    const { data } = db.auth.onAuthStateChange((_, s) => setAuth(s));
    return () => data.subscription.unsubscribe();
  }, [db]);
  async function api(path, method = "GET", data) {
    const { data: s } = await db.auth.getSession();
    const res = await fetch(`/api/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${s.session?.access_token ?? ""}`,
        ...(data ? { "Content-Type": "application/json" } : {}),
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (!res.ok) {
      const e = await res.json();
      throw new Error(e.error ?? "Request failed");
    }
    return res.json();
  }
  async function run(fn) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function refreshProjects() {
    setProjects(await api("projects"));
  }
  useEffect(() => {
    if (auth) run(refreshProjects);
  }, [auth?.user.id]);
  useEffect(() => {
    const p = localStorage.getItem("research-project");
    if (p) setProjectId(p);
    const sid = localStorage.getItem("research-session");
    if (auth && sid) run(async () => setSession(await api(`sessions/${sid}`)));
  }, [auth?.user.id]);
  async function refresh() {
    if (!projectId) return;
    const [r, h] = await Promise.all([
      api(`requirements?projectId=${projectId}`),
      api(`sessions?projectId=${projectId}`),
    ]);
    setRequirements(r);
    setHistory(h);
  }
  useEffect(() => {
    setSession(null);
    if (auth && projectId) {
      localStorage.setItem("research-project", projectId);
      run(refresh);
    }
  }, [projectId, auth?.user.id]);
  useEffect(() => {
    if (auth && ["evaluation", "dashboard"].includes(section))
      run(async () => setEvaluations(await api("evaluations")));
  }, [auth?.user.id, section]);
  function remember(s) {
    setSession(s);
    localStorage.setItem("research-session", s.id);
  }
  async function download(path, name) {
    const { data: s } = await db.auth.getSession();
    const r = await fetch(`/api/${path}`, {
      headers: { Authorization: `Bearer ${s.session?.access_token}` },
    });
    if (!r.ok) throw new Error((await r.json()).error);
    const url = URL.createObjectURL(await r.blob()),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
  const exports = session && (
    <div className="actions">
      {["cases", "validation", "traceability"].flatMap((kind) =>
        ["csv", "json"].map((f) => (
          <button
            key={kind + f}
            disabled={busy}
            onClick={() =>
              run(() =>
                download(
                  `sessions/${session.id}/export?kind=${kind}&format=${f}`,
                  `${kind}.${f}`,
                ),
              )
            }
          >
            {kind} · {f.toUpperCase()}
          </button>
        )),
      )}
    </div>
  );
  const report = session?.validation;
  function edit(r) {
    setDraft(r);
    setConstraintText(JSON.stringify(r.constraints, null, 2));
  }
  const editor = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          const payload = {
            ...draft,
            projectId,
            constraints: JSON.parse(constraintText),
          };
          const r = await api(
            draft.id ? `requirements/${draft.id}` : "requirements",
            draft.id ? "PUT" : "POST",
            payload,
          );
          await refresh();
          edit(r);
          setMessage("Requirement saved.");
        });
      }}
    >
      <h2>{draft.id ? "Edit requirement" : "Create requirement"}</h2>
      <p className="muted">
        One field per requirement. Constraints are validated on the server. Use
        the constraint guide below.
      </p>
      {[
        ["title", "Title"],
        ["description", "Description"],
        ["fieldName", "Input field name"],
        ["validBehaviour", "Expected valid behaviour"],
        ["invalidBehaviour", "Expected invalid behaviour"],
      ].map(([key, label]) => (
        <label key={key}>
          {label}
          <input
            required
            maxLength={key === "description" ? 2000 : 1000}
            value={draft[key]}
            onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          />
        </label>
      ))}
      <label>
        Input type
        <select
          value={draft.type}
          onChange={(e) => {
            const type = e.target.value,
              c =
                type === "decimal"
                  ? { precision: 2, step: 0.01 }
                  : type === "enum"
                    ? { allowedValues: ["reader", "editor"] }
                    : {};
            setDraft({ ...draft, type, constraints: c });
            setConstraintText(JSON.stringify(c, null, 2));
          }}
        >
          {TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label className="check">
        <input
          type="checkbox"
          checked={draft.required}
          onChange={(e) => setDraft({ ...draft, required: e.target.checked })}
        />
        Required field
      </label>
      <ConstraintFields type={draft.type} text={constraintText} onChange={setConstraintText} />
      <details className="advanced"><summary>Advanced JSON</summary><p className="helper">Edit the exact constraint object. Changes are reflected in the guided controls.</p>
      <label>
        Constraints (JSON)
        <textarea
          rows={6}
          required
          value={constraintText}
          onChange={(e) => setConstraintText(e.target.value)}
        />
      </label>
      </details>
      <details>
        <summary>Constraint guide</summary>
        <p>
          Text/password/email: minLength, maxLength, format (email or
          alphanumeric). Integer: min, max, minExclusive, maxExclusive. Decimal:
          numeric bounds plus required precision (0–6) and optional step. Date:
          minDate, maxDate (YYYY-MM-DD), exclusive flags. Enum: allowedValues.
          Boolean: empty object. Numeric step grid is anchored at zero.
        </p>
      </details>
      <button className="primary" disabled={busy || !projectId}>
        Save requirement
      </button>
      <button type="button" onClick={() => edit(empty)}>
        Clear editor
      </button>
    </form>
  );
  return (
    <div className="shell">
      <a className="skip-link" href="#workspace">Skip to workspace</a>
      <aside>
        <Link className="brand" href="/">
          R / T<span>RESEARCH FRAMEWORK</span>
        </Link>
        <nav aria-label="Main navigation">
          {navigation.map(([key, label]) => (
            <Link
              key={key}
              className={section === key ? "active" : ""}
              aria-current={section === key ? "page" : undefined}
              href={`/${key}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-foot">
          Rule version {RULE_VERSION}
          <br />
          MIVA Open University · MIT
        </div>
      </aside>
      <main id="workspace" className="workspace" aria-busy={busy}>
        <header>
          <div>
            <div className="eyebrow">
              RULE-BASED TEST GENERATION & VALIDATION
            </div>
            <h1>{navigation.find((n) => n[0] === section)?.[1]}</h1>
          </div>
          {auth && (
            <button
              onClick={() =>
                run(async () => {
                  await db.auth.signOut();
                  localStorage.removeItem("research-session");
                  localStorage.removeItem("research-project");
                  setSession(null);
                  setProjects([]);
                  setProjectId("");
                })
              }
            >
              Sign out
            </button>
          )}
        </header>
        {message && (
          <div role="status" className="notice">
            {message}
          </div>
        )}
        {busy && <p className="loading" role="status">Working…</p>}
        {section === "documentation" ? (
          <Documentation />
        ) : !auth ? (
          <article className="auth">
            <h2>Access your research workspace</h2>
            {!db ? (
              <p>
                Supabase is not configured. Copy .env.example to .env.local,
                enter your project URL and publishable key, and restart the
                application. See docs/deployment-guide.md.
              </p>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    const { error } = await db.auth.signInWithPassword({
                      email,
                      password,
                    });
                    if (error) throw error;
                  });
                }}
              >
                <label>
                  Email
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    minLength={8}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
                <div className="actions">
                  <button className="primary" disabled={busy}>
                    Sign in
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const { error } = await db.auth.signUp({
                          email,
                          password,
                        });
                        if (error) throw error;
                        setMessage(
                          "Account requested. Confirm your email if required, then sign in.",
                        );
                      })
                    }
                  >
                    Create account
                  </button>
                </div>
              </form>
            )}
          </article>
        ) : (
          <>
            <div className="project-picker">
              <label>
                Active project
                <select
                  aria-label="Active project"
                  value={projectId}
                  onChange={(e) => {
                    setSelected([]);
                    setProjectId(e.target.value);
                  }}
                >
                  <option value="">Choose a project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
              {session && <span className="muted">Session: {session.id}</span>}
            </div>
            {session && <p className="notice">Session source: <strong>{session.source === "manual_csv" ? "manual_csv - manually authored import" : "Automatically generated"}</strong>{session.source === "manual_csv" && <span> / {session.validation?.scope === "manual-constraint-checks/v1" ? "Manual constraint checks performed; generation metadata is not certified." : "Unvalidated author claims. No independent checks performed."}</span>}</p>}
            {section === "dashboard" && (
              <>
                <div className="grid three">
                  {[
                    ["Your projects (latest 100)", projects.length],
                    ["Active project requirements (up to 1,000)", projectId ? requirements.length : "Not selected"],
                    ["Active project sessions (latest 100)", projectId ? history.length : "Not selected"],
                  ].map(([name, n]) => (
                    <article key={name}>
                      <p>{name}</p>
                      <strong className="metric">{n}</strong>
                    </article>
                  ))}
                </div>
                {!projects.length && <p className="empty-state">Begin with a project. Then define a field and its constraints on Requirements. Your counts reflect saved records, not demonstration data.</p>}
                <article>
                  <h2>Evaluation evidence</h2>
                  {evaluations.length ? <><p>Latest saved run / {new Date(evaluations[0].created_at).toLocaleString()}</p><p>{evaluations[0].payload.runs.length} recorded repetitions. Open Evaluation to inspect condition coverage, correctness, redundancy and core generation times from this persisted run.</p><Table headers={["First recorded iteration", "Coverage", "Correctness", "Redundancy"]} rows={evaluations[0].payload.runs.slice(0,1).map(r => [r.iteration, r.coverage == null ? "Not available" : `${r.coverage.toFixed(1)}%`, r.correctness == null ? "Not available" : `${r.correctness.toFixed(1)}%`, r.duplicationRate == null ? "Not available" : `${r.duplicationRate.toFixed(1)}%`])} /><Link href="/evaluation">Inspect all saved metrics</Link></> : <p className="muted">No saved evaluations yet. Run an evaluation with environment notes to record actual metrics. No research scores are assumed.</p>}
                </article>
                <article>
                  <h2>Your research workflow</h2>
                  <p>
                    Choose a project, define its fields, generate a reproducible
                    session, and inspect the independent validation report.
                  </p>
                  <div className="actions">
                    <Link className="button" href="/projects">
                      Create project
                    </Link>
                    <Link className="button" href="/generation">
                      Generate cases
                    </Link>
                    <Link className="button" href="/evaluation">
                      Run evaluation
                    </Link>
                  </div>
                </article>
              </>
            )}
            {section === "projects" && (
              <>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const p = await api("projects", "POST", {
                        title: projectTitle,
                      });
                      await refreshProjects();
                      setProjectId(p.id);
                      setProjectTitle("");
                      setMessage("Project created.");
                    });
                  }}
                >
                  <h2>Create a project</h2>
                  <label>
                    Project title
                    <input
                      required
                      maxLength={200}
                      value={projectTitle}
                      onChange={(e) => setProjectTitle(e.target.value)}
                    />
                  </label>
                  <button className="primary" disabled={busy}>
                    Create project
                  </button>
                </form>
                <Table
                  headers={["Project", "ID", "Created"]}
                  rows={projects.map((p) => [
                    p.title,
                    <code>{p.id}</code>,
                    new Date(p.created_at).toLocaleString(),
                  ])}
                />
              </>
            )}
            {["requirements", "requirement-editor"].includes(section) && (
              <>
                {!projectId && <p className="empty-state">Choose an active project above, or <Link href="/projects">create a project</Link>, before saving a requirement.</p>}
                <CSVImport key={`requirements:${projectId}`} kind="requirements" projectId={projectId} requirements={requirements} api={api} onImported={refresh} />
                {editor}
                {section === "requirements" && (
                  <Table
                    headers={["Requirement", "Type", "Constraints", "Actions"]}
                    rows={requirements.map((r) => [
                      <>
                        <strong>{r.title}</strong>
                        <br />
                        <code>{r.id}</code>
                      </>,
                      r.type,
                      JSON.stringify(r.constraints),
                      <div className="actions">
                        <button onClick={() => edit(r)}>Edit</button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              await api(`requirements/${r.id}`, "DELETE");
                              await refresh();
                              setMessage(
                                "Requirement deleted. Historical session snapshots are retained.",
                              );
                            })
                          }
                        >
                          Delete
                        </button>
                      </div>,
                    ])}
                  />
                )}
              </>
            )}
            {section === "generation" && (
              <article>
                <h2>Select requirements</h2>
                <p>
                  Up to 50 requirements and 2,500 cases per session. Ordering is
                  stable within rule version {RULE_VERSION}.
                </p>
                {requirements.length ? (
                  requirements.map((r) => (
                    <label key={r.id} className="check">
                      <input
                        type="checkbox"
                        checked={selected.includes(r.id)}
                        onChange={(e) =>
                          setSelected(
                            e.target.checked
                              ? [...selected, r.id]
                              : selected.filter((id) => id !== r.id),
                          )
                        }
                      />
                      {r.title} · {r.type}
                    </label>
                  ))
                ) : (
                  <p className="empty-state">No requirements in this project yet. <Link href="/requirements">Define a requirement</Link>, then return here to select it for generation.</p>
                )}
                <button
                  className="primary"
                  disabled={busy || !selected.length}
                  onClick={() =>
                    run(async () => {
                      const s = await api("sessions", "POST", {
                        projectId,
                        requirementIds: selected,
                      });
                      remember(s);
                      await refresh();
                      setMessage(
                        `Generated and saved ${s.cases.length} cases. Open Test repository or Validation.`,
                      );
                    })
                  }
                >
                  Generate test cases
                </button>
                {session && (
                  <p>
                    {session.cases.length} cases / {session.source === "manual_csv" ? "Manually authored import: generation time not applicable" : `core engine ${session.coreDurationMs.toFixed(3)} ms`}{" "}
                    <Link href="/test-cases">Inspect cases →</Link>
                  </p>
                )}
              </article>
            )}
            {section === "test-cases" && (
              <>
                <CSVImport key={`manual-cases:${projectId}`} kind="manual-cases" projectId={projectId} requirements={requirements} api={api} onImported={async data => { remember(await api(`sessions/${data.id}`)); await refresh(); }} />
                <label>
                  Filter cases
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Title, rule or category"
                  />
                </label>
                {exports}
                <Table
                  headers={[
                    "Case / requirement",
                    "Category / source or rule",
                    "Input",
                    "Expected",
                    "Details",
                  ]}
                  rows={(session?.cases ?? [])
                    .filter((t) =>
                      JSON.stringify(t)
                        .toLowerCase()
                        .includes(query.toLowerCase()),
                    )
                    .map((t) => [
                      <>
                        <strong>{t.title}</strong>
                        <br />
                        <code>{t.id}</code>
                        <br />
                        {t.requirementId}
                      </>,
                      <>
                        {t.category}
                        <br />
                        {t.source === "manual_csv" ? "manual_csv / author objective" : t.ruleId}
                      </>,
                      <pre>{JSON.stringify(t.input)}</pre>,
                      <>
                        {t.expectedValid ? "Valid" : "Invalid"} ·{" "}
                        {t.expectedResult}
                        {t.source === "manual_csv" && <><br /><Badge>{session.validation?.findings.find(f => f.caseId === t.id)?.status ?? "Unvalidated"}</Badge></>}
                      </>,
                      <details>
                        <summary>Inspect metadata</summary>
                        <pre>{JSON.stringify(t, null, 2)}</pre>
                      </details>,
                    ])}
                />
              </>
            )}
            {section === "validation" && (
              <>
                <button
                  className="primary"
                  disabled={!session || busy}
                  onClick={() =>
                    run(async () => {
                      remember(
                        await api(
                          `sessions/${session.id}/validate`,
                          "POST",
                          {},
                        ),
                      );
                      setMessage(session.source === "manual_csv" ? "Manual constraint checks saved. No generation provenance asserted." : "Independent validation saved.");
                    })
                  }
                >
                  {session?.source === "manual_csv" ? "Validate manual cases" : "Validate cases"}
                </button>
                {report ? (
                  <>
                    <div className="grid three">
                      {[
                        ["Total cases", report.summary.total],
                        ["Passed", report.summary.passed],
                        ["Failed", report.summary.failed],
                        ...(session?.source === "manual_csv" ? [["Unvalidated", report.summary.unvalidated ?? 0]] : []),
                      ].map(([k, v]) => (
                        <article key={k}>
                          {k}
                          <strong className="metric">{v}</strong>
                        </article>
                      ))}
                    </div>
                    <article>
                      <p>
                        Traceability:{" "}
                        <Badge>{report.summary.traceabilityStatus}</Badge> ·
                        Redundant cases: {report.scope === "unvalidated" ? "Not assessed" : report.summary.duplicateCases} ·
                        Missing conditions:{" "}
                        {report.scope === "unvalidated" ? "Not assessed" : report.summary.missingConditions.length}
                      </p>
                      {report.summary.missingConditions.map((c) => (
                        <p key={c}>{c}</p>
                      ))}
                      {report.checks.map((c) => (
                        <p key={c.name}>
                          {c.name}: <Badge>{c.status}</Badge>
                        </p>
                      ))}
                    </article>
                    <Table
                      headers={["Case", "Status", "Findings"]}
                      rows={report.findings.map((f) => [
                        f.caseId,
                        <Badge>{f.status}</Badge>,
                        f.messages.join("; "),
                      ])}
                    />
                    <h2>Duplicate groups</h2>
                    <Table
                      headers={["Cases", "Reason"]}
                      rows={report.duplicateGroups.map((g) => [
                        g.ids.join(", "),
                        g.reason,
                      ])}
                    />
                    {exports}
                  </>
                ) : (
                  <p>Generate a session or reopen one from History.</p>
                )}
              </>
            )}
            {section === "traceability" && (
              <>
                {exports}
                <Table
                  headers={[
                    "Requirement",
                    "Constraints",
                    "Cases / rules",
                    "Coverage",
                    "Validation",
                  ]}
                  rows={(
                    report?.traceability ??
                    requirements.map((r) => ({
                      requirementId: r.id,
                      description: r.description,
                      constraints: r.constraints,
                      caseIds: [],
                      rules: [],
                      covered: [],
                      uncovered: ["No generation session selected"],
                      status: "Failed",
                    }))
                  ).map((t) => [
                    <>
                      <code>{t.requirementId}</code>
                      <p>{t.description}</p>
                    </>,
                    <pre>{JSON.stringify(t.constraints, null, 2)}</pre>,
                    <details>
                      <summary>{t.caseIds.length} cases</summary>
                      {t.caseIds.map((id) => (
                        <p key={id}>{id}</p>
                      ))}
                      {t.rules.join(", ")}
                    </details>,
                    <>
                      {t.status === "Unvalidated" ? "Coverage not assessed" : `${t.covered.length} covered`}
                      <details>
                        <summary>{t.status === "Unvalidated" ? "Assessment pending" : `${t.uncovered.length} missing`}</summary>
                        {t.uncovered.join(", ")}
                      </details>
                    </>,
                    <Badge>{t.status}</Badge>,
                  ])}
                />
                {report &&
                  requirements
                    .filter(
                      (r) =>
                        !report.traceability.some(
                          (t) => t.requirementId === r.id,
                        ),
                    )
                    .map((r) => (
                      <p className="notice" key={r.id}>
                        Requirement {r.title} has no cases in this session.
                      </p>
                    ))}
              </>
            )}
            {section === "history" && (
              <Table
                headers={["Session", "Created", "Cases", "Action"]}
                rows={history.map((h) => [
                  <code>{h.id}</code>,
                  new Date(h.created_at).toLocaleString(),
                  h.payload.source === "manual_csv" ? "manual_csv - reopen to inspect" : h.payload.validation.summary.total,
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        remember(await api(`sessions/${h.id}`));
                        setMessage(
                          "Session reopened. View Test repository, Validation or Traceability.",
                        );
                      })
                    }
                  >
                    Reopen session
                  </button>,
                ])}
              />
            )}
            {section === "evaluation" && (
              <>
                <article>
                  <h2>Reproducible experiment</h2>
                  <p className="notice">CSV imports never start experiments or supply human design time. Manual comparison requires the existing measured-time and participant protocol. Project import references are not automatically mapped to benchmark identities; use only cases authored for the benchmark specification.</p>
                  <p>
                    Dataset {dataset.version}: {dataset.requirements.length}{" "}
                    requirements, {dataset.references.length} specified
                    reference conditions; independent review is not certified.
                  </p>
                  <label>
                    Environment and protocol
                    <input
                      required
                      value={environment}
                      onChange={(e) => setEnvironment(e.target.value)}
                      placeholder="CPU, OS, Node version, warm-up policy"
                    />
                  </label>
                  <label>
                    Repetitions
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={repetitions}
                      onChange={(e) => setRepetitions(Number(e.target.value))}
                    />
                  </label>
                  <details>
                    <summary>Optional manual comparison</summary>
                    <p>
                      Start the timer before designing cases. Stop after
                      completing them. Paste the actual cases as JSON using the
                      semantic case schema: requirementId, input, expectedValid,
                      expectedResult, category and objective. Generation metadata
                      is not required. Use benchmark requirement IDs and preserve
                      any manual_csv source labels. Only the timer's current-tab interval is
                      measured. Reloading discards the interval.
                    </p>
                    <button
                      disabled={timing}
                      onClick={() => {
                        timer.current = performance.now();
                        setDuration(null);
                        setTiming(true);
                      }}
                    >
                      Start manual timer
                    </button>
                    <button
                      disabled={!timing}
                      onClick={() => {
                        setDuration(performance.now() - timer.current);
                        setTiming(false);
                      }}
                    >
                      Stop manual timer
                    </button>
                    <p>
                      {timing
                        ? "Timing in progress"
                        : duration === null
                          ? "No manual measurement"
                          : `${duration.toFixed(0)} ms recorded`}
                    </p>
                    <label>
                      Actual manual cases (JSON array)
                      <textarea
                        rows={6}
                        value={manualText}
                        onChange={(e) => setManualText(e.target.value)}
                      />
                    </label>
                    <label>
                      Participant and controlled protocol notes
                      <input
                        value={manualNotes}
                        onChange={(e) => setManualNotes(e.target.value)}
                      />
                    </label>
                  </details>
                  <button
                    className="primary"
                    disabled={busy || !projectId || !environment || timing}
                    onClick={() =>
                      run(async () => {
                        await api("evaluations", "POST", {
                          projectId,
                          repetitions,
                          environment,
                          manual:
                            duration === null
                              ? null
                              : {
                                  durationMs: duration,
                                  cases: JSON.parse(manualText),
                                  notes: manualNotes,
                                },
                        });
                        setEvaluations(await api("evaluations"));
                        setMessage("Evaluation recorded.");
                      })
                    }
                  >
                    Run evaluation
                  </button>
                </article>
                {evaluations.map((e) => (
                  <article key={e.id}>
                    <h2>Run {new Date(e.created_at).toLocaleString()}</h2>
                    <p>
                      {e.payload.environment} · {e.payload.sampleSize}{" "}
                      requirements · {e.payload.repetitions} repetitions
                    </p>
                    <Table
                      headers={[
                        "Iteration",
                        "Condition coverage",
                        e.payload.evaluationMethodVersion === "2.0.0" ? "Semantic correctness" : "Correctness (historical method)",
                        "Duplication",
                        "Core time (ms)",
                        ...(e.payload.evaluationMethodVersion === "2.0.0" ? ["Generated certification (passed/assessed)"] : []),
                      ]}
                      rows={e.payload.runs.map((r) => [
                        r.iteration,
                        `${r.coverage?.toFixed(2)}%`,
                        `${r.correctness?.toFixed(2)}%`,
                        `${r.duplicationRate?.toFixed(2)}%`,
                        r.coreDurationMs.toFixed(3),
                        ...(e.payload.evaluationMethodVersion === "2.0.0" ? [`${r.generatedMetadataCertification?.passed ?? "Not recorded"}/${r.generatedMetadataCertification?.assessed ?? "Not recorded"}`] : []),
                      ])}
                    />
                    {e.payload.evaluationMethodVersion === "2.0.0" && <p className="notice">Comparison method 2.0.0: source-neutral semantic scores. Generated certification separately applies the existing metadata and semantic validator. Manual authorship and independent oracle review are not certified.</p>}
                    <div
                      className="chart"
                      role="img"
                      aria-label="Coverage, correctness and duplication percentages for first repetition"
                    >
                      {["coverage", "correctness", "duplicationRate"].map(
                        (k) => (
                          <div key={k}>
                            {k}
                            <div className="bar-track">
                              <div
                                className="bar"
                                style={{
                                  width: `${e.payload.runs[0][k] ?? 0}%`,
                                }}
                              />
                            </div>
                            {e.payload.runs[0][k]?.toFixed(2)}%
                          </div>
                        ),
                      )}
                    </div>
                    <p>
                      {e.payload.manual
                        ? `Recorded manual design time: ${e.payload.manual.durationMs.toFixed(0)} ms. Coverage ${e.payload.manual.metrics.coverage?.toFixed(2)}%; correctness ${e.payload.manual.metrics.correctness?.toFixed(2)}%; duplication ${e.payload.manual.metrics.duplicationRate?.toFixed(2)}%.`
                        : "No manual comparison recorded."}
                    </p>
                    <div className="actions">
                      {["json", "csv"].map((f) => (
                        <button
                          key={f}
                          onClick={() =>
                            run(() =>
                              download(
                                `evaluations/${e.id}?format=${f}`,
                                `evaluation.${f}`,
                              ),
                            )
                          }
                        >
                          Export {f.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
