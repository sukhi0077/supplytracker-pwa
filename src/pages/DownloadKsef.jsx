// src/pages/DownloadKsef.jsx
// Enter your KSeF NIP + authorization token, pick a date range, and fetch
// supplier invoices — same idea as the original SupplyTracker downloader. The
// actual KSeF calls run in the Cloudflare Worker (authenticated by your signed-in
// admin session); the NIP + token are sent to it per run. Fetch history comes
// from ksef_fetch_jobs.
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useKsefJobs } from "../hooks/useCatalogue.js";
import { KsefJobRepository } from "../repositories/KsefJobRepository.js";
import { PageHeader, Card, Loading, Empty, Pill } from "../components/ui/parts.jsx";
import { Field, Text, Btn } from "../components/ui/form.jsx";

const iso = (d) => d.toISOString().slice(0, 10);
const today = () => iso(new Date());
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));

const WORKER_URL = import.meta.env.VITE_KSEF_WORKER_URL || "";
const LS = "ksef.creds.v1";

export default function DownloadKsef({ isAdmin }) {
  const jobs = useKsefJobs();
  const qc = useQueryClient();

  const [environment, setEnvironment] = useState("test");
  const [nip, setNip] = useState("");
  const [token, setToken] = useState("");
  const [remember, setRemember] = useState(false);
  const [from, setFrom] = useState(daysAgo(7));
  const [to, setTo] = useState(today());
  const [updateExisting, setUpdateExisting] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [note, setNote] = useState("");

  // Restore remembered creds on this device.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(LS) || "null");
      if (saved) {
        setNip(saved.nip || "");
        setToken(saved.token || "");
        setEnvironment(saved.environment || "test");
        setRemember(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const persist = (on) => {
    setRemember(on);
    if (on) localStorage.setItem(LS, JSON.stringify({ nip, token, environment }));
    else localStorage.removeItem(LS);
  };

  const call = async (path) => {
    setError("");
    setSummary(null);
    setNote("");
    if (!WORKER_URL) return setError("KSeF Worker URL is not configured (set VITE_KSEF_WORKER_URL).");
    if (!nip.trim() || !token.trim()) return setError("Enter your NIP and KSeF token.");
    setBusy(path);
    try {
      const res = await KsefJobRepository.runFetch({
        workerUrl: WORKER_URL,
        path,
        from,
        to,
        updateExisting,
        nip: nip.trim(),
        token: token.trim(),
        environment,
      });
      if (remember) localStorage.setItem(LS, JSON.stringify({ nip, token, environment }));
      if (path === "/auth-test") {
        setNote(res.ok ? "✓ Signed in to KSeF successfully." : "KSeF login did not return a token.");
      } else {
        setSummary(res);
        qc.invalidateQueries({ queryKey: ["ksefJobs"] });
        qc.invalidateQueries({ queryKey: ["invoices"] });
      }
    } catch (e) {
      setError(e.message || "Request failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div>
      <PageHeader
        title="Download KSeF"
        subtitle="Provide your NIP and KSeF token, then fetch supplier invoices."
      />

      {isAdmin ? (
        <Card className="mb-4 p-4">
          {!WORKER_URL && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The KSeF Worker isn't wired up yet. Deploy <code>workers/</code> and set{" "}
              <code>VITE_KSEF_WORKER_URL</code> to its URL.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Environment">
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
              >
                <option value="test">test</option>
                <option value="demo">demo</option>
                <option value="prod">prod</option>
              </select>
            </Field>
            <Field label="NIP">
              <Text value={nip} onChange={setNip} placeholder="1234567890" />
            </Field>
            <Field label="KSeF token" className="sm:col-span-2" hint="Your KSeF authorization token. Encrypted in transit; used only for this run.">
              <Text type="password" value={token} onChange={setToken} placeholder="••••••••" />
            </Field>
          </div>

          {/* Overlapping 8-day presets — each window shares one day with the
              adjacent one so no invoice slips through a gap between weekly runs. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Quick range:</span>
            <button
              type="button"
              onClick={() => { setFrom(daysAgo(7)); setTo(today()); }}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              This week (8d)
            </button>
            <button
              type="button"
              onClick={() => { setFrom(daysAgo(14)); setTo(daysAgo(7)); }}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Last week (8d)
            </button>
            <span className="text-[11px] text-slate-400">windows overlap by 1 day to avoid gaps</span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="From">
              <Text type="date" value={from} onChange={setFrom} />
            </Field>
            <Field label="To">
              <Text type="date" value={to} onChange={setTo} />
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              Update existing invoices
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={remember} onChange={(e) => persist(e.target.checked)} />
              Remember NIP &amp; token on this device
            </label>
            <div className="ml-auto flex gap-2">
              <Btn onClick={() => call("/auth-test")} disabled={!!busy || !WORKER_URL}>
                {busy === "/auth-test" ? "Checking…" : "Test login"}
              </Btn>
              <Btn variant="primary" onClick={() => call("/run/ksef")} disabled={!!busy || !WORKER_URL}>
                {busy === "/run/ksef" ? "Fetching…" : "Fetch invoices"}
              </Btn>
            </div>
          </div>

          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {note && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</div>}
          {summary && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              Done — found {summary.found ?? "?"}, created {summary.created ?? 0}, updated {summary.updated ?? 0},
              skipped {summary.skipped ?? 0}
              {summary.remaining ? `, ${summary.remaining} left (run again)` : ""}
              {summary.errors?.length ? `, ${summary.errors.length} error(s)` : ""}.
              {summary.errors?.length ? (
                <div className="mt-1 max-h-24 overflow-y-auto text-xs text-red-700">
                  {summary.errors.slice(0, 8).map((e, i) => (
                    <div key={i}>{e}</div>
                  ))}
                </div>
              ) : null}
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
