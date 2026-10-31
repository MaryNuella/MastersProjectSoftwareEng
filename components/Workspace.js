"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { browserDb } from "../lib/browser";
import { TYPES } from "../lib/requirements";
import { RULES, RULE_VERSION } from "../lib/rules";
import dataset from "../benchmarks/dataset.json";
const navigation = [
  ["dashboard", "Overview"],
  ["projects", "Projects"],
  ["requirements", "Requirements"],
  ["requirement-editor", "Requirement editor"],
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
              <td colSpan={headers.length}>No records yet.</td>
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
    if (auth && section === "evaluation")
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
      <label>
        Constraints (JSON)
        <textarea
          rows={6}
          required
          value={constraintText}
          onChange={(e) => setConstraintText(e.target.value)}
        />
      </label>
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
      <aside>
        <Link className="brand" href="/">
          R / T<span>RESEARCH FRAMEWORK</span>
        </Link>
        <nav aria-label="Main navigation">
          {navigation.map(([key, label]) => (
            <Link
              key={key}
              className={section === key ? "active" : ""}
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
      <main className="workspace">
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
        {busy && <p role="status">Working…</p>}
        {section === "documentation" ? (
          <>
            <article>
              <h2>Defence demonstration workflow</h2>
              <ol>
                <li>
                  Configure Supabase, apply the migration, and create an
                  account.
                </li>
                <li>
                  Create a project, then add a required password field with
                  lengths 8–20.
                </li>
                <li>Select that requirement and generate a session.</li>
                <li>
                  Inspect 7, 8, 12, 20 and 21 character inputs and the expected
                  behaviours.
                </li>
                <li>
                  Revalidate and inspect missing conditions, duplicates and
                  traceability.
                </li>
                <li>Export CSV and JSON, then run the benchmark evaluation.</li>
              </ol>
              <p>
                Generated cases are design artifacts. The framework evaluates
                field constraints; it does not execute them against an arbitrary
                target website.
              </p>
            </article>
            <Table
              headers={["Rule", "Technique", "Algorithm"]}
              rows={Object.entries(RULES).map(([id, r]) => [
                id,
                r.technique,
                r.description,
              ])}
            />
            <article>
              <h2>Research method</h2>
              <p>
                Requirement-condition coverage uses the versioned, manually
                authored benchmark oracle. Correctness uses independent
                assertions over saved requirement snapshots. Duplication
                requires matching requirement, input, constraints, outcome and
                objective. A repeated input with a different objective is
                retained.
              </p>
              <p>
                Core timings exclude database, network and rendering. Manual
                comparisons require actual work, measured with the timer, and
                case JSON with the documented schema. No manual values are
                inferred.
              </p>
              <p>
                Full architecture, setup, rule catalogue, limits, export schema,
                testing and evidence guidance are in the repository docs
                directory.
              </p>
            </article>
          </>
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
            {section === "dashboard" && (
              <>
                <div className="grid three">
                  {[
                    ["Projects", projects.length],
                    ["Requirements", requirements.length],
                    ["Saved sessions", history.length],
                  ].map(([name, n]) => (
                    <article key={name}>
                      <p>{name}</p>
                      <strong className="metric">{n}</strong>
                    </article>
                  ))}
                </div>
                <article>
                  <h2>From requirements to research evidence</h2>
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
                  <p>Add requirements before generating.</p>
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
                    {session.cases.length} cases · core engine{" "}
                    {session.coreDurationMs.toFixed(3)} ms{" "}
                    <Link href="/test-cases">Inspect cases →</Link>
                  </p>
                )}
              </article>
            )}
            {section === "test-cases" && (
              <>
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
                    "Category / rule",
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
                        {t.ruleId}
                      </>,
                      <pre>{JSON.stringify(t.input)}</pre>,
                      <>
                        {t.expectedValid ? "Valid" : "Invalid"} ·{" "}
                        {t.expectedResult}
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
                      setMessage("Independent validation saved.");
                    })
                  }
                >
                  Validate cases
                </button>
                {report ? (
                  <>
                    <div className="grid three">
                      {[
                        ["Total cases", report.summary.total],
                        ["Passed", report.summary.passed],
                        ["Failed", report.summary.failed],
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
                        Redundant cases: {report.summary.duplicateCases} ·
                        Missing conditions:{" "}
                        {report.summary.missingConditions.length}
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
                      {t.covered.length} covered
                      <details>
                        <summary>{t.uncovered.length} missing</summary>
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
                  h.payload.validation.summary.total,
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
                  <p>
                    Dataset {dataset.version}: {dataset.requirements.length}{" "}
                    requirements, {dataset.references.length} independently
                    authored reference conditions.
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
                      test case schema; missing metadata is assessed as a
                      failure. Only the timer's current-tab interval is
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
                        "Correctness",
                        "Duplication",
                        "Core time (ms)",
                      ]}
                      rows={e.payload.runs.map((r) => [
                        r.iteration,
                        `${r.coverage?.toFixed(2)}%`,
                        `${r.correctness?.toFixed(2)}%`,
                        `${r.duplicationRate?.toFixed(2)}%`,
                        r.coreDurationMs.toFixed(3),
                      ])}
                    />
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
