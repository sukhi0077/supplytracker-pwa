// src/pages/DownloadKsef.jsx
// Trigger a KSeF invoice fetch and view the run history. In the PWA the actual
// fetch runs in the Cloudflare Worker (KSeF credentials live there as Worker
// Secrets, never in the browser). This page kicks off the Worker's manual
// endpoint and shows the ksef_fetch_jobs history.
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useKsefJobs } from "../hooks/useCatalogue.js";
import { KsefJobRepository } from "../repositories/KsefJobRepository.js";
import { PageHeader, Card, Loading, Empty, Pill } from "../components/ui/parts.jsx";
import { Field, Text, Btn } from "../components/ui/form.jsx";

const iso = (d) => d.toISOString().slice(0, 10);
const today = () => iso(new Date());
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

const WORKER_URL = import.meta.env.VITE_KSEF_WORKER_URL || "";

export default function DownloadKsef({ isAdmin }) {
  const jobs = useKsefJobs();
  const qc = useQueryClient();

  const [env, setEnv] = useState("test");
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(today());
  const [updateExisting, setUpdateExisting] = useState(false);
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);

  const run = async () => {
    setError("");
    setSummary(null);
    if (!WORKER_URL) return setError("KSeF Worker URL is not configured (set VITE_KSEF_WORKER_URL).");
    setBusy(true);
    try {
      const res = await KsefJobRepository.runFetch({ workerUrl: WORKER_URL, secret, from, to, updateExisting });
      setSummary(res);
      qc.invalidateQueries({ queryKey: ["ksefJobs"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e) {
      setError(e.message || "Fetch failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Download KSeF"
        subtitle="Fetch supplier invoices from KSeF. Runs in the Cloudflare Worker; credentials live there as secrets."
      />

      {isAdmin ? (
        <Card className="mb-4 p-4">
          {!WORKER_URL && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The KSeF Worker isn't wired up yet. Deploy <code>workers/</code> and set{" "}
              <code>VITE_KSEF_WORKER_URL</code> to its URL. It also runs automatically on a daily cron —
              this page is for on-demand runs and history.
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Environment">
              <select
                value={env}
                onChange={(e) => setEnv(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <option value="test">test</option>
                <option value="demo">demo</option>
                <option value="prod">prod</option>
              </select>
            </Field>
            <Field label="From">
              <Text type="date" value={from} onChange={setFrom} />
            </Field>
            <Field label="To">
              <Text type="date" value={to} onChange={setTo} />
            </Field>
            <Field label="Trigger secret" hint="Kept in memory only; matches the Worker's TRIGGER_SECRET.">
              <Text type="password" value={secret} onChange={setSecret} placeholder="••••••" />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              Update existing invoices
            </label>
            <Btn variant="primary" onClick={run} disabled={busy || !WORKER_URL}>
              {busy ? "Fetching…" : "Run KSeF fetch"}
            </Btn>
          </div>

          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {summary && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Done — found {summary.found ?? "?"}, created {summary.created ?? 0}, updated {summary.updated ?? 0},
              skipped {summary.skipped ?? 0}
              {summary.errors?.length ? `, ${summary.errors.length} error(s)` : ""}.
            </div>
          )}
        </Card>
      ) : (
        <Card className="mb-4 p-4">
          <p className="text-sm text-slate-500">KSeF fetch is admin-only. History below is visible to admins.</p>
        </Card>
      )}

      <h3 className="mb-2 text-sm font-semibold text-slate-700">Recent fetch runs</h3>
      {jobs.isLoading ? (
        <Loading label="Loading history…" />
      ) : (jobs.data || []).length === 0 ? (
        <Card className="p-2"><Empty>No KSeF fetch runs recorded yet.</Empty></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Started</th>
                  <th className="px-4 py-3 font-semibold">Env</th>
                  <th className="px-4 py-3 font-semibold">Range</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold text-right">Found</th>
                  <th className="px-4 py-3 font-semibold text-right">New</th>
                  <th className="px-4 py-3 font-semibold text-right">Upd</th>
                  <th className="px-4 py-3 font-semibold text-right">Err</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(jobs.data || []).map((j) => (
                  <tr key={j.id}>
                    <td className="px-4 py-2.5 text-slate-600">{(j.started_at || "").replace("T", " ").slice(0, 16)}</td>
                    <td className="px-4 py-2.5 text-slate-500">{j.environment}</td>
                    <td className="px-4 py-2.5 text-slate-500">{j.date_from} → {j.date_to}</td>
                    <td className="px-4 py-2.5"><Pill value={j.status} /></td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{j.invoices_found}</td>
                    <td className="px-4 py-2.5 text-right text-emerald-700">{j.invoices_created}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{j.invoices_updated}</td>
                    <td className="px-4 py-2.5 text-right text-red-600">{j.error_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
