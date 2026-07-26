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
  let candidatesTotal = 0;
  try {
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      state.progress = `Fetching (run ${round})…`;
      emit();
      const res = await KsefJobRepository.runFetch(params);
      totals.found = res.found ?? totals.found;
      totals.created += res.created ?? 0;
      totals.updated += res.updated ?? 0;
      totals.skipped = res.skipped ?? totals.skipped;
      // "Left" across the whole session: the worker only knows about one run,
      // so count down from the first run's candidate total ourselves.
      if (round === 1) candidatesTotal = totals.found - (res.skipped ?? 0);
      totals.remaining = Math.min(res.remaining ?? 0, Math.max(0, candidatesTotal - totals.created - totals.updated));
      totals.errors = [...totals.errors, ...(res.errors || [])];
      totals.note = res.note || "";
      state.summary = { ...totals };
      emit();
      onData?.();
      if (!totals.remaining || state.cancel || round === MAX_ROUNDS) break;
      // A round that processed few invoices was rate-limited — give KSeF's
      // limit window a full minute to reset, otherwise a short breather.
      const roundProcessed = (res.created ?? 0) + (res.updated ?? 0);
      const waitS = roundProcessed >= 5 ? 20 : 60;
      for (let s = waitS; s > 0 && !state.cancel; s--) {
        state.progress = `${totals.remaining} left — next run in ${s}s`;
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
