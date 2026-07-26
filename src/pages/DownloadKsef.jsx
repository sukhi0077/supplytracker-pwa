// src/pages/DownloadKsef.jsx
// Enter your KSeF NIP + authorization token, pick a date range, and fetch
// supplier invoices — same idea as the original SupplyTracker downloader. The
// actual KSeF calls run in the Cloudflare Worker (authenticated by your signed-in
// admin session); the NIP + token are sent to it per run. Fetch history comes
// from ksef_fetch_jobs.
import { useEffect, useRef, useState } from "react";
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
  const [progress, setProgress] = useState("");
  const cancelRef = useRef(false);

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
      setNote(res.ok ? "✓ Signed in to KSeF successfully." : "KSeF login did not return a token.");
    } catch (e) {
      setError(e.message || "Request failed.");
    } finally {
      setBusy("");
    }
  };

  // Fetch invoices, auto-continuing while the worker reports invoices "left".
  // Each round is a fresh worker invocation (fresh free-tier subrequest budget);
  // the pause between rounds lets KSeF's rate limit cool down.
  const MAX_ROUNDS = 8;
  const WAIT_S = 20;
  const runAll = async () => {
    setError("");
    setSummary(null);
    setNote("");
    if (!WORKER_URL) return setError("KSeF Worker URL is not configured (set VITE_KSEF_WORKER_URL).");
    if (!nip.trim() || !token.trim()) return setError("Enter your NIP and KSeF token.");
    setBusy("/run/ksef");
    cancelRef.current = false;
    const totals = { found: 0, created: 0, updated: 0, skipped: 0, remaining: 0, errors: [], note: "" };
    try {
      for (let round = 1; round <= MAX_ROUNDS; round++) {
        setProgress(`Fetching (run ${round})…`);
        const res = await KsefJobRepository.runFetch({
          workerUrl: WORKER_URL,
          path: "/run/ksef",
          from,
          to,
          updateExisting,
          nip: nip.trim(),
          token: token.trim(),
          environment,
        });
        totals.found = res.found ?? totals.found;
        totals.created += res.created ?? 0;
        totals.updated += res.updated ?? 0;
        totals.skipped = res.skipped ?? totals.skipped;
        totals.remaining = res.remaining ?? 0;
        totals.errors = [...totals.errors, ...(res.errors || [])];
        totals.note = res.note || "";
        setSummary({ ...totals });
        qc.invalidateQueries({ queryKey: ["ksefJobs"] });
        qc.invalidateQueries({ queryKey: ["invoices"] });
        if (remember) localStorage.setItem(LS, JSON.stringify({ nip, token, environment }));
        if (!totals.remaining || cancelRef.current || round === MAX_ROUNDS) break;
        for (let s = WAIT_S; s > 0 && !cancelRef.current; s--) {
          setProgress(`${totals.remaining} left — next run in ${s}s`);
          await new Promise((r) => setTimeout(r, 1000));
        }
        if (cancelRef.current) break;
      }
    } catch (e) {
      setError(e.message || "Request failed.");
    } finally {
      setBusy("");
      setProgress("");
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
            <Field label="KSeF token" className="col-span-2" hint="Your KSeF authorization token. Encrypted in transit; used only for this run.">
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
              This week
            </button>
            <button
              type="button"
              onClick={() => { setFrom(daysAgo(14)); setTo(daysAgo(7)); }}
              className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Last week
            </button>
            <span className="hidden text-[11px] text-slate-400 sm:inline" title="8-day windows overlapping by 1 day so nothing slips through">8-day windows, 1-day overlap</span>
          </div>

          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="From" className="min-w-0">
              <Text type="date" value={from} onChange={setFrom} className="min-w-0" />
            </Field>
            <Field label="To" className="min-w-0">
              <Text type="date" value={to} onChange={setTo} className="min-w-0" />
            </Field>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" checked={updateExisting} onChange={(e) => setUpdateExisting(e.target.checked)} />
              Update existing
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600" title="Remember NIP & token on this device">
              <input type="checkbox" checked={remember} onChange={(e) => persist(e.target.checked)} />
              Remember credentials
            </label>
            <div className="grid w-full grid-cols-2 gap-2 sm:ml-auto sm:flex sm:w-auto">
              <Btn onClick={() => call("/auth-test")} disabled={!!busy || !WORKER_URL}>
                {busy === "/auth-test" ? "Checking…" : "Test login"}
              </Btn>
              <Btn
                variant={busy === "/run/ksef" ? "danger" : "primary"}
                onClick={() => (busy === "/run/ksef" ? (cancelRef.current = true) : runAll())}
                disabled={(!!busy && busy !== "/run/ksef") || !WORKER_URL}
              >
                {busy === "/run/ksef" ? "Stop" : "Fetch invoices"}
              </Btn>
            </div>
          </div>

          {progress && <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-800">{progress}</div>}
          {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
          {note && <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{note}</div>}
          {summary && (
            <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              {busy === "/run/ksef" ? "So far" : "Done"}: {summary.found ?? "?"} found · {summary.created ?? 0} new · {summary.updated ?? 0} updated
              {summary.remaining ? ` · ${summary.remaining} left` : ""}
              {summary.errors?.length ? ` · ${summary.errors.length} error(s)` : ""}
              {summary.note ? <div className="mt-1 text-xs text-emerald-700">{summary.note}</div> : null}
              {summary.note ? <div className="mt-1 text-xs text-emerald-700">{summary.note}</div> : null}
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
          {/* Mobile: stacked cards. */}
          <div className="divide-y divide-slate-100 md:hidden">
            {(jobs.data || []).map((j) => (
              <div key={j.id} className="p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-slate-700">{(j.started_at || "").replace("T", " ").slice(0, 16)}</span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">{j.environment}</span>
                    <Pill value={j.status} />
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">{j.date_from} → {j.date_to}</div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs">
                  <span className="text-slate-600">Found {j.invoices_found}</span>
                  <span className="text-emerald-700">New {j.invoices_created}</span>
                  <span className="text-slate-600">Upd {j.invoices_updated}</span>
                  {j.error_count > 0 && <span className="text-red-600">Err {j.error_count}</span>}
                </div>
              </div>
            ))}
          </div>
          {/* Desktop: table. */}
          <div className="hidden overflow-x-auto md:block">
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
