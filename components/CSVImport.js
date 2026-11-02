"use client";
import { useState } from "react";
import { CSV_LIMIT, templateCSV } from "../lib/csv-import";

export default function CSVImport({ kind, projectId, requirements, api, onImported }) {
  const [open, setOpen] = useState(false), [file, setFile] = useState(null), [csv, setCSV] = useState("");
  const [preview, setPreview] = useState(null), [mapping, setMapping] = useState({}), [refs, setRefs] = useState([]);
  const [confirmed, setConfirmed] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  function template() {
    const url = URL.createObjectURL(new Blob([templateCSV(kind)], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${kind}-template.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function selectFile(e) {
    const chosen = e.target.files[0];
    setPreview(null); setConfirmed(false); setMessage(""); setMapping({}); setRefs([]); setFile(null); setCSV("");
    if (!chosen) return;
    try {
      if (!/\.csv$/i.test(chosen.name) || !["", "text/csv", "text/plain", "application/vnd.ms-excel"].includes(chosen.type)) throw Error("Select a UTF-8 .csv file");
      if (chosen.size > CSV_LIMIT) throw Error("CSV exceeds the 180,000-byte limit");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await chosen.arrayBuffer());
      setFile(chosen); setCSV(text);
    } catch (error) { setMessage(error.message); }
  }
  async function submit(action) {
    setBusy(true); setMessage("");
    try {
      const data = await api(`imports/${kind}/${action}`, "POST", { projectId, fileName: file.name, csv, mapping, ...(action === "confirm" ? { confirmed, previewDigest: preview.digest } : {}) });
      if (action === "preview") { setPreview(data); setRefs(data.references); setConfirmed(false); }
      else {
        // Clear confirmation immediately after a successful write, before refreshing views.
        setPreview(null); setConfirmed(false); setCSV(""); setFile(null);
        setMessage(`Imported ${data.imported} ${kind === "requirements" ? "requirements" : "manual cases (Unvalidated)"}.`);
        await onImported(data);
      }
    } catch (error) { setMessage(error.message); setConfirmed(false); if (action === "confirm") setPreview(null); }
    finally { setBusy(false); }
  }
  return <section className="csv-import" aria-label={`${kind} CSV import`}>
    <div className="actions"><button type="button" onClick={() => setOpen(!open)} aria-expanded={open}>Import CSV</button><button type="button" onClick={template}>Download CSV template</button></div>
    {open && <article aria-busy={busy}>
      <h2>{kind === "requirements" ? "Import requirements" : "Import manual test cases"}</h2>
      <p className="muted">UTF-8 CSV, up to 180,000 bytes. Preview every row before confirming. The entire file is accepted or rejected; existing records are not overwritten.</p>
      {kind === "manual-cases" && <p className="notice">Manual imports retain manual_csv provenance. Outcomes are author claims and remain Unvalidated until you explicitly run independent manual checks. Importing does not create evaluation results or measured human design time.</p>}
      {!projectId && <p className="notice">Select an active project before previewing or importing.</p>}
      <label>CSV file<input type="file" accept=".csv,text/csv" disabled={busy} onChange={selectFile} /></label>
      {kind === "manual-cases" && refs.length > 0 && <fieldset><legend>Requirement references</legend><p className="helper">References match an existing requirement UUID or a unique field name. Resolve ambiguous references explicitly, then preview again.</p>{refs.map(ref => <label key={ref}>Map {ref}<select aria-label={`Map ${ref}`} value={mapping[ref] ?? ""} disabled={busy} onChange={e => { setMapping({ ...mapping, [ref]: e.target.value }); setPreview(null); setConfirmed(false); }}><option value="">Automatic UUID / unique field name</option>{requirements.map(r => <option key={r.id} value={r.id}>{r.title} / {r.fieldName} / {r.id}</option>)}</select></label>)}</fieldset>}
      <button type="button" disabled={busy || !file || !projectId} onClick={() => submit("preview")}>Preview CSV</button>
      {preview && <>
        <p role="status">{preview.validCount} valid rows; {preview.invalidCount} invalid rows. No records have been saved.</p>
        <div className="table-wrap"><table><thead><tr><th>CSV row</th><th>Status</th><th>Parsed values</th><th>Errors</th></tr></thead><tbody>{preview.rows.map(r => <tr key={r.row}><td>{r.row}</td><td>{r.valid ? "Valid" : "Invalid"}</td><td><pre>{JSON.stringify(r.value ?? r.raw, null, 2)}</pre></td><td>{r.errors.join("; ")}</td></tr>)}</tbody></table></div>
        <label className="check"><input type="checkbox" checked={confirmed} disabled={busy || preview.invalidCount > 0 || preview.validCount === 0} onChange={e => setConfirmed(e.target.checked)} />I reviewed these rows and confirm saving them to the active project.</label>
        <button type="button" className="primary" disabled={busy || !confirmed || preview.invalidCount > 0 || preview.validCount === 0} onClick={() => submit("confirm")}>Confirm import</button>
      </>}
      {busy && <p role="status" className="loading">Checking import...</p>}
      {message && <p role="status" className="notice">{message}</p>}
    </article>}
  </section>;
}
