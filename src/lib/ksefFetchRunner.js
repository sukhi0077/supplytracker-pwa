// src/lib/ksefFetchRunner.js — app-level KSeF fetch loop.
//
// Lives outside React so the auto-continue loop keeps running when the user
// navigates to another page; DownloadKsef subscribes to render progress. The
// loop stops if the tab/app is closed (use the worker cron for true background).
import { KsefJobRepository } from "../repositories/KsefJobRepository.js";

const MAX_ROUNDS = 15;

const state = { busy: false, progress: "", summary: null, error: "", cancel: false };
const subs = new Set();
const emit = () => subs.forEach((fn) => fn({ ...state }));

export function subscribeKsefFetch(fn) {
  subs.add(fn);
  fn({ ...state });
  return () => subs.delete(fn);
}

export const cancelKsefFetch = () => {
  state.cancel = true;
};

export async function startKsefFetch(params, { onData } = {}) {
  if (state.busy) return;
  state.busy = true;
  state.cancel = false;
  state.error = "";
  state.summary = null;
  emit();

  const totals = { found: 0, created: 0, updated: 0, skipped: 0, remaining: 0, errors: [], note: "" };
  try {
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      state.progress = `Fetching (run ${round})…`;
      emit();
      const res = await KsefJobRepository.runFetch(params);
      totals.found = res.found ?? totals.found;
      totals.created += res.created ?? 0;
      totals.updated += res.updated ?? 0;
      totals.skipped = res.skipped ?? totals.skipped;
      // The worker's own count, not session arithmetic. It skips invoices
      // refreshed in the last half hour, so a pass genuinely reaches 0 —
      // deriving "left" here from totals was guesswork that drifted.
      totals.remaining = res.remaining ?? 0;
      // Belt and braces: a session can never touch more invoices than exist.
      // An older Worker could still loop and report more updates than found.
      const cap = totals.found || Infinity;
      if (totals.created + totals.updated > cap) totals.updated = Math.max(0, cap - totals.created);
      totals.errors = [...totals.errors, ...(res.errors || [])];
      totals.note = res.note || "";
      state.summary = { ...totals };
      emit();
      onData?.();
      if (!totals.remaining || state.cancel || round === MAX_ROUNDS) break;
      // Wait on the Worker's word, not on a guess. It reports whether KSeF
      // actually throttled the run; a short round because only three invoices
      // were left is not a reason to idle for a minute.
      const waitS = res.rateLimited ? 60 : 15;
      for (let s = waitS; s > 0 && !state.cancel; s--) {
        state.progress = res.rateLimited
          ? `KSeF rate limit — waiting ${s}s (${totals.remaining} left)`
          : `${totals.remaining} left — next run in ${s}s`;
        emit();
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (state.cancel) break;
    }
  } catch (e) {
    state.error = e.message || "Request failed.";
  } finally {
    state.busy = false;
    state.progress = "";
    emit();
  }
}
